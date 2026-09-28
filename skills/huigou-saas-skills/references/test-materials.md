# 测试商品

将下列链接逐条粘贴到 Demo 的「分享内容解析」，再选择返回的候选。它们是用户提供的真实商品页，尚不保证链接有效、已开通推广或有返利；需在授权的测试环境核对。

| 商城 | 商品链接 |
| --- | --- |
| 淘宝 / 天猫 | https://detail.tmall.com/item.htm?id=649479273712 |
| 京东 | https://item.jd.com/10211463817676.html |
| 1688 | https://detail.1688.com/offer/585468402829.html |
| 唯品会 | https://detail.vip.com/detail-1710612785-6919169191930082065.html |
| 抖音 | https://haohuo.jinritemai.com/ecommerce/trade/detail/index.html?id=3644272059510584408 |

GraphQL 中，1688 的商城枚举为 `alibaba`；抖音普通商品用 `douyin` + `goods`，不要当作 `life` 团购。详情查询优先使用解析出的商品 ID，转链使用候选的商品链接。
