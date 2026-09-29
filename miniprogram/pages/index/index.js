const BASE = "http://127.0.0.1:8787";
const sections = ["promote", "orders", "profile", "wallet", "bills", "withdrawals"];
const walletPeriods = ["day", "month", "year"];
const accountLabels = { 1: "支付宝", 2: "微信", 3: "银行卡" };
const emptyAccountForm = () => ({ type: 1, name: "", account: "", identificationCode: "", bankName: "" });
const withdrawalLabels = {
    1: "系统审核中", 2: "已驳回", 3: "待打款", 4: "打款中",
    5: "打款成功", 6: "打款失败", 7: "人工审核中",
};
const orderLabels = { "-2": "系统关闭", "-1": "已关闭", 1: "已下单", 2: "已付款", 3: "已发货", 4: "已收货" };
const platformLabels = { alibaba: "1688", jd: "京东", taobao: "淘宝", vip: "唯品会", pdd: "拼多多", douyin: "抖音" };
const platformMarks = { alibaba: "阿", jd: "京", taobao: "淘", vip: "唯", pdd: "拼", douyin: "抖" };

function datePart(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

function displayAmount(value) {
    if (value == null) return value;
    const text = String(value).trim();
    return /^-?\d+\.\d+$/.test(text) ? text.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1") : text;
}

function orderRecord(item) {
    const goods = Array.isArray(item.detail?.goods) ? item.detail.goods.filter(Boolean).map((good) => ({ ...good, displayItemPrice: displayAmount(good.itemPrice), imageFailed: false })) : [];
    return {
        ...item,
        goods,
        platformLabel: platformLabels[item.platform] || item.platform || "未知平台",
        platformMark: platformMarks[item.platform] || "单",
        statusLabel: orderLabels[item.status] || "状态待确认",
        settleLabel: item.settleStatus === 1 ? "预计返" : item.settleStatus === 3 ? "已结清返利" : item.settleStatus === -1 ? "返利无效" : "返利信息暂无",
        hasRebate: item.settleStatus === 1 || item.settleStatus === 3,
        displayPrice: displayAmount(item.detail?.payPrice ?? item.paidAmount),
        displayRebate: displayAmount(item.rebateMoney),
        orderDate: datePart(item.orderedAt),
        confirmDate: datePart(item.confirmedAt),
        rebateDate: datePart(item.settleStatus === 3 ? item.settledAt : item.settleStatus === 1 ? item.expectedSettleAt : null),
    };
}

Page({
    data: {
        demo: true,
        statusBarHeight: typeof wx.getSystemInfoSync === "function" ? wx.getSystemInfoSync().statusBarHeight : 20,
        configured: false,
        backendSupportsAccounts: false,
        backendReachable: false,
        backendChecked: false,
        checkingBackend: false,
        mode: "promote",
        connected: false,
        busy: false,
        error: "",
        notice: "",
        profile: null,
        walletPeriod: "day",
        walletStats: [],
        walletPage: 1,
        walletHasMore: false,
        walletLoaded: false,
        accounts: [],
        accountsLoaded: false,
        accountFormMode: "",
        editingAccountId: null,
        clearIdentity: false,
        accountForm: emptyAccountForm(),
        withdrawalAmount: "",
        withdrawalAccountId: null,
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

    onShow() {
        this.checkBackend();
    },

    checkBackend() {
        if (this.data.checkingBackend || this.data.busy) return;
        this.setData({ checkingBackend: true });
        wx.request({
            url: `${BASE}/api/status`,
            success: ({ statusCode, data }) => {
                const backendReachable = statusCode === 200 && data?.demo === true;
                const backendSupportsAccounts = backendReachable && data.supportsAccountManagement === true;
                const configured = backendReachable && Boolean(data.configured);
                if (!backendReachable || !configured) this.clearSession();
                this.setData({
                    backendReachable,
                    configured,
                    backendSupportsAccounts,
                    error: !backendReachable ? "本机端口未返回 Demo 后端状态，请检查服务和端口。"
                        : !configured ? "本机后端尚未配置，请检查 .env 并重启后端。"
                            : !backendSupportsAccounts ? "本机运行的是旧版 Demo 后端，请重启后端并重试加载。" : "",
                });
                if (configured && backendSupportsAccounts && !this.data.connected) void this.connect();
            },
            fail: () => {
                this.clearSession();
                this.setData({
                    backendReachable: false,
                    configured: false,
                    backendSupportsAccounts: false,
                    error: "无法访问本机后端，请检查服务、端口和开发者工具的本地请求设置。",
                });
            },
            complete: () => this.setData({ checkingBackend: false, backendChecked: true }),
        });
    },

    clearSession() {
        this.invalidateCandidates();
        getApp().globalData.session = "";
        this.setData({ connected: false, profile: null, walletStats: [], walletLoaded: false, walletHasMore: false, records: [], candidates: [], selected: null, selectedIndex: -1, item: null, link: null,
            accounts: [], accountsLoaded: false, accountFormMode: "", accountForm: emptyAccountForm(), clearIdentity: false, withdrawalAmount: "", withdrawalAccountId: null });
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
                    if (statusCode === 404 && body?.code === "NOT_FOUND" && ["accounts", "createAccount", "updateAccount", "deleteAccount", "withdraw"].includes(action)) {
                        this.setData({ backendSupportsAccounts: false });
                        return reject(new Error("运行中的 Demo 后端版本过旧，请重启后端并重试加载。"));
                    }
                    if (body?.code === "SESSION_EXPIRED") {
                        this.clearSession();
                    }
                    reject(new Error(body?.message || "服务请求失败，请检查本机后端。"));
                },
                fail: () => reject(new Error("无法连接本机后端；请检查端口、模拟器设置和本机网络。")),
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
        if (this.data.connected || this.data.busy) return;
        this.run(async () => {
            const result = await this.api("login");
            this.invalidateCandidates();
            getApp().globalData.session = result.session;
            this.setData({
                connected: true, configured: true, profile: result.profile,
                candidates: [], selected: null, selectedIndex: -1, item: null, link: null,
                records: [], loaded: false, walletStats: [], walletLoaded: false, walletHasMore: false,
                accounts: [], accountsLoaded: false, accountFormMode: "", accountForm: emptyAccountForm(), clearIdentity: false, withdrawalAmount: "", withdrawalAccountId: null,
            });
        }).then(() => {
            if (this.data.connected && this.data.mode === "wallet") this.loadWallet(1);
            if (this.data.connected && ["orders", "bills", "withdrawals"].includes(this.data.mode)) this.loadRecords(1);
        });
    },

    changeTab(event) {
        if (this.data.busy) return;
        const mode = event.currentTarget.dataset.mode;
        if (!sections.includes(mode) || mode === this.data.mode) return;
        this.setData({ mode, error: "", notice: "", records: [], page: 1, hasMore: false, loaded: false });
        if (["orders", "bills", "withdrawals"].includes(mode) && this.data.connected) this.loadRecords(1);
        if (mode === "wallet" && this.data.connected) {
            this.setData({ walletStats: [], walletPage: 1, walletHasMore: false, walletLoaded: false });
            this.loadWallet(1);
        }
    },

    backToProfile() {
        if (this.data.busy) return;
        const mode = this.data.mode === "accounts" ? "withdraw" : this.data.mode === "withdraw" ? "wallet" : "profile";
        this.setData({ mode, error: "", notice: "", accountFormMode: "", accountForm: emptyAccountForm(), clearIdentity: false,
            ...(mode !== "withdraw" ? { withdrawalAmount: "" } : {}) });
        if (mode === "withdraw") this.loadAccounts(true);
    },

    openAccounts() {
        if (this.data.busy || !this.data.connected || !this.data.backendSupportsAccounts || this.data.mode !== "withdraw") return;
        this.setData({ mode: "accounts", error: "", notice: "", accountsLoaded: false, accountFormMode: "", accountForm: emptyAccountForm(), clearIdentity: false });
        this.loadAccounts();
    },

    openWithdrawal() {
        if (this.data.busy || !this.data.connected || !this.data.backendSupportsAccounts) return;
        this.setData({ mode: "withdraw", error: "", notice: "", accountsLoaded: false, withdrawalAmount: "", withdrawalAccountId: null });
        this.loadAccounts(true);
    },

    loadAccounts(refreshProfile = false) {
        return this.run(async () => {
            const accounts = (await this.api("accounts")).data;
            const profile = refreshProfile ? (await this.api("profile")).data : null;
            if (!this.data.connected || !["accounts", "withdraw"].includes(this.data.mode)) return;
            const selected = accounts.some((item) => item.id === this.data.withdrawalAccountId)
                ? this.data.withdrawalAccountId : (accounts.find((item) => item.isDefault) || accounts[0])?.id ?? null;
            this.setData({ accounts: accounts.map((item) => ({ ...item, typeLabel: accountLabels[item.type] })), accountsLoaded: true,
                withdrawalAccountId: selected, ...(profile ? { profile } : {}) });
        });
    },

    showCreateAccount() {
        if (this.data.busy) return;
        this.setData({ accountFormMode: "create", editingAccountId: null, accountForm: emptyAccountForm(), clearIdentity: false, error: "" });
    },

    showEditAccount(event) {
        if (this.data.busy) return;
        const id = Number(event.currentTarget.dataset.id);
        if (!this.data.accounts.some((account) => account.id === id)) return;
        this.setData({ accountFormMode: "edit", editingAccountId: id, accountForm: emptyAccountForm(), clearIdentity: false, error: "" });
    },

    cancelAccountForm() {
        this.setData({ accountFormMode: "", editingAccountId: null, accountForm: emptyAccountForm(), clearIdentity: false });
    },

    setAccountType(event) {
        const type = Number(event.currentTarget.dataset.type);
        if (![1, 2, 3].includes(type) || this.data.busy) return;
        this.setData({ accountForm: { ...this.data.accountForm, type, account: "", bankName: "" } });
    },

    updateAccountField(event) {
        const field = event.currentTarget.dataset.field;
        if (!["name", "account", "identificationCode", "bankName"].includes(field)) return;
        this.setData({ accountForm: { ...this.data.accountForm, [field]: event.detail.value } });
    },

    toggleClearIdentity() {
        if (this.data.accountFormMode !== "edit" || this.data.busy) return;
        this.setData({ clearIdentity: !this.data.clearIdentity,
            accountForm: { ...this.data.accountForm, identificationCode: "" } });
    },

    saveAccount() {
        if (this.data.busy) return;
        const { accountForm: form, accountFormMode, editingAccountId, clearIdentity } = this.data;
        if (!accountFormMode) return;
        let input;
        if (accountFormMode === "create") {
            if (!form.name.trim() || !form.account.trim()) {
                this.setData({ error: "请填写收款人姓名和收款账号。" });
                return;
            }
            input = { type: form.type, name: form.name, account: form.account,
                ...(form.identificationCode.trim() ? { identificationCode: form.identificationCode } : {}),
                ...(form.type === 3 && form.bankName.trim() ? { bankName: form.bankName } : {}) };
        } else {
            input = { id: editingAccountId,
                ...(form.name.trim() ? { name: form.name } : {}),
                ...(clearIdentity ? { identificationCode: "" } : form.identificationCode.trim() ? { identificationCode: form.identificationCode } : {}) };
            if (Object.keys(input).length === 1) {
                this.setData({ error: "请输入要修改的姓名或证件号码。" });
                return;
            }
        }
        this.setData({ accountForm: emptyAccountForm() });
        this.run(async () => {
            await this.api(accountFormMode === "create" ? "createAccount" : "updateAccount", input);
            this.setData({ accountFormMode: "", editingAccountId: null });
            this.setData({ notice: "收款账号已保存。" });
            const accounts = (await this.api("accounts")).data;
            if (this.data.mode === "accounts" && this.data.connected) {
                this.setData({ accounts: accounts.map((item) => ({ ...item, typeLabel: accountLabels[item.type] })), accountsLoaded: true, notice: "收款账号已保存。" });
            }
        });
    },

    deleteAccount(event) {
        if (this.data.busy) return;
        const id = Number(event.currentTarget.dataset.id);
        if (!this.data.accounts.some((account) => account.id === id)) return;
        wx.showModal({ title: "删除收款账号", content: "仅删除账号登记；已申请的提现记录仍会保留。", success: ({ confirm }) => {
            if (!confirm || this.data.busy || this.data.mode !== "accounts") return;
            this.run(async () => {
                await this.api("deleteAccount", { id });
                this.cancelAccountForm();
                const accounts = (await this.api("accounts")).data;
                if (this.data.mode === "accounts" && this.data.connected) {
                    this.setData({ accounts: accounts.map((item) => ({ ...item, typeLabel: accountLabels[item.type] })), accountsLoaded: true, notice: "账号已删除。" });
                }
            });
        } });
    },

    updateWithdrawalAmount(event) {
        this.setData({ withdrawalAmount: event.detail.value });
    },

    selectWithdrawalAccount(event) {
        const id = Number(event.currentTarget.dataset.id);
        if (this.data.accounts.some((item) => item.id === id)) this.setData({ withdrawalAccountId: id });
    },

    submitWithdrawal() {
        if (this.data.busy || this.confirmingWithdrawal) return;
        const amount = this.data.withdrawalAmount.trim();
        const withdrawalAccountId = this.data.withdrawalAccountId;
        const account = this.data.accounts.find((item) => item.id === withdrawalAccountId);
        if (!account || !/^[1-9]\d{0,9}(?:\.\d{1,2})?$/.test(amount)) {
            this.setData({ error: "请选择收款账号，并填写不低于 1 元且最多两位小数的金额。" });
            return;
        }
        this.confirmingWithdrawal = true;
        wx.showModal({ title: "确认申请提现", content: `从当前成员余额申请提现 ¥${amount} 至 ${account.typeLabel} ${account.account}？提交后将占用实际可用余额。`, success: ({ confirm }) => {
            this.confirmingWithdrawal = false;
            if (!confirm || this.data.busy || this.data.mode !== "withdraw" || !this.data.connected) return;
            this.setData({ withdrawalAmount: "" });
            this.run(async () => {
                const withdrawal = (await this.api("withdraw", { amount, withdrawalAccountId })).data;
                this.setData({ notice: `提现申请 #${withdrawal.id} 已提交，请在提现记录中查看后续状态。` });
                let profile;
                try {
                    profile = (await this.api("profile")).data;
                    if (this.data.mode === "withdraw" && this.data.connected) this.setData({ profile });
                    await this.loadAccountsAfterWithdrawal();
                } catch {
                    this.setData({ error: "申请已提交，但刷新余额或默认账号失败。请查看提现记录后再操作，勿重复提交。" });
                    return;
                }
            });
        }, fail: () => { this.confirmingWithdrawal = false; } });
    },

    async loadAccountsAfterWithdrawal() {
        const accounts = (await this.api("accounts")).data;
        if (this.data.mode === "withdraw" && this.data.connected) {
            this.setData({ accounts: accounts.map((item) => ({ ...item, typeLabel: accountLabels[item.type] })) });
        }
    },

    changeWalletPeriod(event) {
        if (this.data.busy || this.data.mode !== "wallet") return;
        const period = event.currentTarget.dataset.period;
        if (!walletPeriods.includes(period) || period === this.data.walletPeriod) return;
        this.setData({ walletPeriod: period, walletStats: [], walletPage: 1, walletHasMore: false, walletLoaded: false });
        this.loadWallet(1);
    },

    refreshWallet() {
        if (this.data.mode === "wallet" && !this.data.busy) {
            this.setData({ walletStats: [], walletPage: 1, walletHasMore: false, walletLoaded: false });
            this.loadWallet(1);
        }
    },

    loadWallet(page) {
        this.run(async () => {
            const period = this.data.walletPeriod;
            const result = (await this.api("wallet", { period, page })).data;
            if (this.data.mode !== "wallet" || period !== this.data.walletPeriod || !this.data.connected) return;
            this.setData({
                profile: result.profile,
                walletStats: page === 1 ? result.items : this.data.walletStats.concat(result.items),
                walletPage: page, walletHasMore: result.hasMore, walletLoaded: true,
            });
        });
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
            this.setData({ candidates: cards, selected: null, selectedIndex: -1, item: null, link: null, notice: cards.length ? "点击候选内容即可转链。" : "上游没有返回可用候选，请换一条有效分享内容。" });
            void this.enrichCandidates(version, cards);
        });
    },

    selectCandidate(event) {
        if (this.data.busy || !this.data.connected) return;
        const index = Number(event.currentTarget.dataset.index);
        const candidate = this.data.candidates[index];
        if (!candidate) return;
        this.setData({ selected: candidate, selectedIndex: index, selectedType: candidate.type, item: null, link: null, error: "", notice: "" });
        this.createLink();
    },

    candidateImageError(event) {
        const index = Number(event.currentTarget.dataset.index);
        if (Number(event.currentTarget.dataset.version) !== this.candidateVersion || this.data.candidates[index]?.preview?.imageUrl !== event.currentTarget.dataset.image) return;
        this.updateCandidate(index, { imageFailed: true });
    },

    setType(event) {
        const type = event.currentTarget.dataset.type;
        if (this.data.busy || !this.data.selected || type === this.data.selectedType || !["goods", "activity", "live", "life"].includes(type)) return;
        this.setData({ selectedType: type, item: null, link: null });
        this.createLink();
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
            const version = this.candidateVersion;
            const index = this.data.selectedIndex;
            const session = getApp().globalData.session;
            const isCurrent = () => version === this.candidateVersion && index === this.data.selectedIndex &&
                selected.materialType === this.data.selectedType && session === getApp().globalData.session && this.data.connected;
            const link = (await this.api("link", selected)).data;
            if (!isCurrent()) return;
            this.setData({ link, notice: "已生成推广链接；这不代表已产生订单。" });
            this.guideLink(link, selected.platform, isCurrent);
        });
    },

    guideLink(link, platform, isCurrent) {
        const shortLink = typeof link?.miniProgram?.shortLink === "string" ? link.miniProgram.shortLink.trim() : "";
        const fallback = () => {
            if (!isCurrent()) return;
            const code = typeof link?.code === "string" ? link.code.trim() : "";
            const url = link?.shortUrl || link?.url;
            if (code) this.copyPromotion(code, "口令", platform, isCurrent);
            else if (url) this.copyPromotion(url, "网址", platform, isCurrent);
            else this.setData({ error: "转链成功，但没有可用的小程序、口令或网址。" });
        };
        const copyMiniLink = () => shortLink ? this.copyMiniProgramLink(link, isCurrent) : fallback();
        const navigate = (options, onFailure) => {
            if (!isCurrent()) return;
            if (typeof wx.navigateToMiniProgram !== "function") return onFailure();
            let settled = false;
            try {
                wx.navigateToMiniProgram({ ...options, success: () => { settled = true; }, fail: () => {
                    if (settled) return;
                    settled = true;
                    onFailure();
                } });
            } catch {
                if (!settled) {
                    settled = true;
                    onFailure();
                }
            }
        };
        const navigateShortLink = () => shortLink ? navigate({ shortLink }, copyMiniLink) : fallback();
        if (link?.miniProgram?.appId && link?.miniProgram?.path) {
            navigate({ appId: link.miniProgram.appId, path: link.miniProgram.path }, navigateShortLink);
        } else navigateShortLink();
    },

    copyPromotion(value, kind, platform, isCurrent = () => this.data.connected, prompt) {
        try {
            wx.setClipboardData({
                data: value,
                success: () => {
                    if (!isCurrent()) return;
                    this.setData({ error: "" });
                    wx.showModal({ title: `${kind}复制成功`, content: prompt || `已复制${kind}，请打开${platformLabels[platform] || platform || "购物平台"}继续购买。`, showCancel: false });
                },
                fail: () => {
                    if (isCurrent()) this.setData({ error: `${kind}复制失败，请重试。` });
                },
            });
        } catch {
            if (isCurrent()) this.setData({ error: `${kind}复制失败，请重试。` });
        }
    },

    copyMiniProgramLink(link, isCurrent = () => this.data.connected && this.data.link === link) {
        if (!isCurrent()) return;
        const shortLink = typeof link?.miniProgram?.shortLink === "string" ? link.miniProgram.shortLink.trim() : "";
        if (!shortLink) return;
        const shareText = shortLink.startsWith("#小程序://");
        this.copyPromotion(shortLink, shareText ? "小程序分享文本" : "小程序链接", null, isCurrent,
            shareText ? "已复制分享文本，请打开微信并粘贴到聊天中打开。" : "已复制小程序链接，请在微信中打开。");
    },

    retryCopyMiniProgramLink() {
        this.copyMiniProgramLink(this.data.link);
    },

    openMiniProgram() {
        const link = this.data.link;
        if (((link?.miniProgram?.appId && link?.miniProgram?.path) || link?.miniProgram?.shortLink) && !this.data.busy) {
            this.guideLink(link, this.data.selected?.platform, () => this.data.connected && this.data.link === link);
        }
    },

    copyCode() {
        const link = this.data.link;
        if (link?.code) this.copyPromotion(link.code, "口令", this.data.selected?.platform, () => this.data.connected && this.data.link === link);
    },

    copyLink() {
        const link = this.data.link;
        const url = link?.shortUrl || link?.url;
        if (url) this.copyPromotion(url, "网址", this.data.selected?.platform, () => this.data.connected && this.data.link === link);
    },

    copyOrderSn(event) {
        const order = this.data.records.find((item) => String(item.id) === String(event.currentTarget.dataset.id));
        if (this.data.mode === "orders" && order?.orderSn) wx.setClipboardData({ data: order.orderSn });
    },

    orderImageError(event) {
        const { id, index, image } = event.currentTarget.dataset;
        const records = this.data.records.slice();
        const recordIndex = records.findIndex((item) => String(item.id) === String(id));
        if (this.data.mode !== "orders" || recordIndex < 0 || records[recordIndex].goods[index]?.imageUrl !== image) return;
        records[recordIndex] = { ...records[recordIndex], goods: records[recordIndex].goods.slice() };
        records[recordIndex].goods[index] = { ...records[recordIndex].goods[index], imageFailed: true };
        this.setData({ records });
    },

    loadMore() {
        if (this.data.mode === "wallet") {
            if (this.data.walletHasMore) this.loadWallet(this.data.walletPage + 1);
            return;
        }
        if (this.data.hasMore) this.loadRecords(this.data.page + 1);
    },

    loadRecords(page) {
        this.run(async () => {
            const mode = this.data.mode;
            const result = (await this.api(mode, { page })).data;
            const records = result.items.map((item) => mode === "orders" ? orderRecord(item) : ({
                ...item,
                statusLabel: mode === "withdrawals" ? withdrawalLabels[item.status] || `状态 ${item.status}` : `状态 ${item.status ?? "未知"}`,
            }));
            if (mode !== this.data.mode) return;
            this.setData({ records: page === 1 ? records : this.data.records.concat(records), page, hasMore: Boolean(result.hasMore), loaded: true });
        });
    },
});
