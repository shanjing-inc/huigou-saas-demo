const BASE = "http://127.0.0.1:8787";
const sections = ["profile", "promote", "orders", "bills", "withdrawals"];
const withdrawalLabels = {
    1: "系统审核中", 2: "已驳回", 3: "待打款", 4: "打款中",
    5: "打款成功", 6: "打款失败", 7: "人工审核中",
};

Page({
    data: {
        demo: true,
        configured: false,
        mode: "profile",
        connected: false,
        busy: false,
        error: "",
        notice: "",
        profile: null,
        content: "",
        candidates: [],
        selected: null,
        selectedIndex: -1,
        selectedType: "goods",
        item: null,
        link: null,
        records: [],
        page: 1,
        hasMore: false,
        loaded: false,
    },

    onLoad() {
        wx.request({
            url: `${BASE}/api/status`,
            success: ({ data }) => this.setData({ configured: Boolean(data?.configured) }),
            fail: () => this.setData({ error: "本地 BFF 未启动，请先按 README 在本机启动。" }),
        });
    },

    api(action, data = {}) {
        return new Promise((resolve, reject) => {
            wx.request({
                url: `${BASE}/api/${action}`,
                method: "POST",
                header: {
                    "content-type": "application/json",
                    ...(getApp().globalData.session ? { "x-demo-session": getApp().globalData.session } : {}),
                },
                data,
                success: ({ statusCode, data: body }) => {
                    if (statusCode >= 200 && statusCode < 300) return resolve(body);
                    if (body?.code === "SESSION_EXPIRED") {
                        this.invalidateCandidates();
                        getApp().globalData.session = "";
                        this.setData({ connected: false, profile: null, records: [], candidates: [], selected: null, selectedIndex: -1, item: null, link: null });
                    }
                    reject(new Error(body?.message || "服务请求失败，请检查本地 BFF。"));
                },
                fail: () => reject(new Error("无法连接本机 BFF；请检查端口、模拟器设置和本机网络。")),
            });
        });
    },

    async run(work) {
        if (this.data.busy) return;
        this.setData({ busy: true, error: "", notice: "" });
        try {
            await work();
        } catch (error) {
            this.setData({ error: error.message });
        } finally {
            this.setData({ busy: false });
        }
    },

    connect() {
        this.run(async () => {
            const result = await this.api("login");
            this.invalidateCandidates();
            getApp().globalData.session = result.session;
            this.setData({
                connected: true, configured: true, profile: result.profile,
                candidates: [], selected: null, selectedIndex: -1, item: null, link: null,
                records: [], loaded: false,
            });
        });
    },

    disconnect() {
        this.invalidateCandidates();
        this.run(async () => {
            try {
                await this.api("logout");
            } finally {
                getApp().globalData.session = "";
                this.setData({ connected: false, profile: null, candidates: [], selected: null, selectedIndex: -1, item: null, link: null, records: [], loaded: false });
            }
        });
    },

    changeTab(event) {
        if (this.data.busy) return;
        const mode = event.currentTarget.dataset.mode;
        if (!sections.includes(mode)) return;
        this.setData({ mode, error: "", notice: "", records: [], page: 1, hasMore: false, loaded: false });
        if (["orders", "bills", "withdrawals"].includes(mode) && this.data.connected) this.loadRecords(1);
    },

    updateContent(event) {
        this.setData({ content: event.detail.value });
    },

    invalidateCandidates() {
        this.candidateVersion = (this.candidateVersion || 0) + 1;
        return this.candidateVersion;
    },

    itemSelection(candidate, materialType = candidate?.type) {
        if (!candidate || !["goods", "life"].includes(materialType)) return null;
        const detail = candidate.detail || {};
        const itemId = typeof detail.itemId === "string" ? detail.itemId.trim() : "";
        const material = itemId || detail.itemUrl;
        return material ? { material, platform: candidate.platform, materialType } : null;
    },

    itemPreview(item) {
        const price = item?.price == null ? "" : String(item.price).trim();
        const coupon = item?.couponInfo?.amount;
        const rebate = item?.rebateInfo?.rebate;
        return {
            title: item?.title || "",
            imageUrl: item?.imageUrl || "",
            shopName: item?.shopName || "",
            price: price && Number.isFinite(Number(price)) ? price : "",
            coupon: coupon != null && Number(coupon) > 0 ? String(coupon) : "",
            rebate: item?.rebateInfo?.status != null && item.rebateInfo.status !== -1 && rebate != null && String(rebate).trim() !== "" && Number.isFinite(Number(rebate)) ? String(rebate) : "",
        };
    },

    updateCandidate(index, patch, version = this.candidateVersion) {
        if (version !== this.candidateVersion || !this.data.connected || !this.data.candidates[index]) return;
        const candidates = this.data.candidates.slice();
        candidates[index] = { ...candidates[index], ...patch };
        this.setData({ candidates, ...(this.data.selectedIndex === index ? { selected: candidates[index] } : {}) });
    },

    async enrichCandidates(version, candidates) {
        let next = 0;
        const worker = async () => {
            while (next < candidates.length && version === this.candidateVersion && this.data.connected) {
                const index = next++;
                const selection = this.itemSelection(candidates[index]);
                if (!selection) continue;
                try {
                    const item = (await this.api("item", selection)).data;
                    this.updateCandidate(index, item ? { preview: this.itemPreview(item), previewState: "ready" } : { previewState: "unavailable" }, version);
                } catch {
                    this.updateCandidate(index, { previewState: "unavailable" }, version);
                }
            }
        };
        await Promise.all([worker(), worker()]);
    },

    parse() {
        this.run(async () => {
            const version = this.invalidateCandidates();
            this.setData({ candidates: [], selected: null, selectedIndex: -1, item: null, link: null });
            const candidates = (await this.api("parse", { content: this.data.content })).data;
            if (version !== this.candidateVersion || !this.data.connected) return;
            const cards = candidates.map((candidate) => ({
                ...candidate,
                preview: null,
                previewState: this.itemSelection(candidate) ? "loading" : "unsupported",
                imageFailed: false,
                version,
            }));
            this.setData({ candidates: cards, selected: null, selectedIndex: -1, item: null, link: null, notice: cards.length ? "请选择要推广的候选内容。" : "上游没有返回可用候选，请换一条有效测试物料。" });
            void this.enrichCandidates(version, cards);
        });
    },

    selectCandidate(event) {
        const index = Number(event.currentTarget.dataset.index);
        const candidate = this.data.candidates[index];
        if (!candidate) return;
        this.setData({ selected: candidate, selectedIndex: index, selectedType: candidate.type, item: null, link: null, error: "", notice: "" });
    },

    candidateImageError(event) {
        const index = Number(event.currentTarget.dataset.index);
        if (Number(event.currentTarget.dataset.version) !== this.candidateVersion || this.data.candidates[index]?.preview?.imageUrl !== event.currentTarget.dataset.image) return;
        this.updateCandidate(index, { imageFailed: true });
    },

    setType(event) {
        const type = event.currentTarget.dataset.type;
        if (!["goods", "activity", "live", "life"].includes(type)) return;
        this.setData({ selectedType: type, item: null, link: null });
    },

    selection(forItem = false) {
        const { selected, selectedType } = this.data;
        if (!selected) return null;
        const itemId = selected.detail.itemId;
        const material = forItem && typeof itemId === "string" && itemId.trim() ? itemId.trim() : selected.detail.itemUrl;
        return { material, platform: selected.platform, materialType: selectedType };
    },

    getItem() {
        this.run(async () => {
            const index = this.data.selectedIndex;
            const version = this.candidateVersion;
            const selected = this.itemSelection(this.data.selected, this.data.selectedType);
            if (!selected) {
                throw new Error("商品详情只支持已选中的商品或团购物料；活动/直播可直接转链。");
            }
            const item = (await this.api("item", selected)).data;
            if (version !== this.candidateVersion || index !== this.data.selectedIndex || !this.data.connected) return;
            if (!item) throw new Error("暂未获取到商品详情，请稍后重试。");
            this.updateCandidate(index, { preview: this.itemPreview(item), previewState: "ready", imageFailed: false }, version);
            this.setData({ item, notice: "商品详情已更新。" });
        });
    },

    createLink() {
        this.run(async () => {
            const selected = this.selection();
            if (!selected) throw new Error("请先解析并选择一条有效候选物料。");
            const link = (await this.api("link", selected)).data;
            this.setData({ link, notice: "真实测试接口已返回转链；这不代表已产生订单。" });
        });
    },

    copyLink() {
        if (this.data.link?.url) wx.setClipboardData({ data: this.data.link.url });
    },

    loadMore() {
        if (this.data.hasMore) this.loadRecords(this.data.page + 1);
    },

    loadRecords(page) {
        this.run(async () => {
            const mode = this.data.mode;
            const result = (await this.api(mode, { page })).data;
            const records = result.items.map((item) => ({
                ...item,
                statusLabel: mode === "withdrawals" ? withdrawalLabels[item.status] || `状态 ${item.status}` : `状态 ${item.status ?? "未知"}`,
            }));
            if (mode !== this.data.mode) return;
            this.setData({ records: page === 1 ? records : this.data.records.concat(records), page, hasMore: Boolean(result.hasMore), loaded: true });
        });
    },
});
