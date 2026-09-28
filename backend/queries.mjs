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
});
