// Selection sets track saas/src/graphql/generated/{application,member}-schema.graphql.
export const operations = Object.freeze({
    login: {
        endpoint: "application",
        query: `mutation Login($openid: String!, $organizationId: Int!, $teamId: Int!) {
            login(openid: $openid, organizationId: $organizationId, teamId: $teamId) { token memberId }
        }`,
    },
    profile: {
        endpoint: "member",
        query: `query Profile { getProfile { memberId teamId role money pendingMoney withdrawalMoney } }`,
        field: "getProfile",
    },
    wallet: {
        endpoint: "application",
        query: `query Wallet($memberId: Int!, $period: RevenueStatisticPeriod!, $page: Int!, $limit: Int!, $from: String, $to: String) {
            listRevenueStatistic(memberId: $memberId, period: $period, page: $page, limit: $limit, from: $from, to: $to) {
                hasMore items { date orderCount estimateMemberOrderCommission settledMemberOrderCommission }
            }
        }`,
        field: "listRevenueStatistic",
    },
    parse: {
        endpoint: "member",
        query: `query Parse($content: String!) {
            parsePromotionMaterial(content: $content) {
                platform type keyContent mallId detail { itemId itemTitle itemUrl }
            }
        }`,
        field: "parsePromotionMaterial",
    },
    item: {
        endpoint: "member",
        query: `query Item($material: String!, $platform: PromotionPlatform!, $materialType: PromotionMaterialType) {
            getPromotionItem(material: $material, platform: $platform, materialType: $materialType) {
                itemId title platform price imageUrl shopName couponInfo { amount } rebateInfo { rebate status }
            }
        }`,
        field: "getPromotionItem",
    },
    link: {
        endpoint: "member",
        query: `mutation Link($material: String!, $platform: PromotionPlatform!, $materialType: PromotionMaterialType) {
            createPromotionLink(material: $material, platform: $platform, materialType: $materialType) {
                url shortUrl code appScheme miniProgram { appId path shortLink }
            }
        }`,
        field: "createPromotionLink",
    },
    orders: {
        endpoint: "member",
        query: `query Orders($page: Int!, $limit: Int!) {
            listOrders(page: $page, limit: $limit) {
                hasMore items {
                    id orderSn platform orderedAt paidAt confirmedAt closedAt
                    paidAmount rebateMoney refundMoney status settleStatus expectedSettleAt settledAt
                    detail { payPrice invalidReason goods { itemId itemTitle imageUrl itemPrice itemNum } }
                }
            }
        }`,
        field: "listOrders",
    },
    bills: {
        endpoint: "member",
        query: `query Bills($page: Int!, $limit: Int!) {
            listBills(page: $page, limit: $limit) {
                hasMore items { id amount action event memo createdAt }
            }
        }`,
        field: "listBills",
    },
    withdrawals: {
        endpoint: "member",
        query: `query Withdrawals($page: Int!, $limit: Int!) {
            listWithdrawals(page: $page, limit: $limit) {
                hasMore items { id amount status createdAt updatedAt }
            }
        }`,
        field: "listWithdrawals",
    },
    accounts: {
        endpoint: "member",
        query: `query WithdrawalAccounts {
            listWithdrawalAccounts { id type name account isDefault }
        }`,
        field: "listWithdrawalAccounts",
    },
    createAccount: {
        endpoint: "member",
        query: `mutation CreateWithdrawalAccount($type: Int!, $name: String!, $account: String!, $identificationCode: String, $ext: String) {
            createWithdrawalAccount(type: $type, name: $name, account: $account, identificationCode: $identificationCode, ext: $ext) { id }
        }`,
        field: "createWithdrawalAccount",
    },
    updateAccount: {
        endpoint: "member",
        query: `mutation UpdateWithdrawalAccount($id: Int!, $name: String, $identificationCode: String) {
            updateWithdrawalAccount(id: $id, name: $name, identificationCode: $identificationCode) { id }
        }`,
        field: "updateWithdrawalAccount",
    },
    deleteAccount: {
        endpoint: "member",
        query: `mutation DeleteWithdrawalAccount($id: Int!) { deleteWithdrawalAccount(id: $id) }`,
        field: "deleteWithdrawalAccount",
    },
    withdraw: {
        endpoint: "member",
        query: `mutation RequestWithdrawal($amount: String!, $withdrawalAccountId: ID!) {
            requestWithdrawal(amount: $amount, withdrawalAccountId: $withdrawalAccountId) { id amount status createdAt }
        }`,
        field: "requestWithdrawal",
    },
});
