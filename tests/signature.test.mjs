import test from "node:test";
import assert from "node:assert/strict";
import { applicationSignContent, signApplicationInput } from "../skills/huigou-saas-skills/scripts/signature.mjs";

const secret = "example-secret";
// Fixed UTF-8 MD5 values independently calculated with Python hashlib.
test("partner signing: login vector and insertion-order independence", () => {
    const variables = { teamId: 2, openid: "demo-openid", organizationId: 1 };
    assert.equal(applicationSignContent(variables), "openid=demo-openid&organizationId=1&teamId=2");
    assert.equal(signApplicationInput(variables, secret), "b3de98e49d0fd88aac1616d19c7fd473");
    assert.equal(signApplicationInput({ organizationId: 1, openid: "demo-openid", teamId: 2 }, secret),
        signApplicationInput(variables, secret));
});

test("partner signing: nested filters and Unicode", () => {
    const variables = { where: { name: { eq: "中文" }, id: { eq: 7 } }, organizationId: 1 };
    assert.equal(applicationSignContent(variables), 'organizationId=1&where={"id":{"eq":7},"name":{"eq":"中文"}}');
    assert.equal(signApplicationInput(variables, secret), "6f6e267aa90224024a6852c4526579fd");
});

test("partner signing: only top-level empties are dropped; spaces, zero, false and nested empties survive", () => {
    const variables = {
        name: " A ", zero: 0, enabled: false, emptyObject: {}, blank: "  ", empty: [], nil: null,
        list: [null, "", {}, [], { z: "中文", a: 0, n: null }],
    };
    const before = JSON.stringify(variables);
    assert.equal(applicationSignContent(variables),
        'emptyObject={}&enabled=false&list=["",{},[],{"a":0,"z":"中文"}]&name= A &zero=0');
    assert.equal(signApplicationInput(variables, secret), "0367266803c9a053f7737053f0c05d02");
    assert.equal(JSON.stringify(variables), before, "signing must not change the submitted variables");
});

test("partner signing: arrays retain order, separators are not URL-encoded, numeric keys follow JS JSON", () => {
    assert.equal(applicationSignContent({ x: [2, null, 1], text: "a&b=c" }), "text=a&b=c&x=[2,1]");
    assert.notEqual(signApplicationInput({ x: [1, 2] }, secret), signApplicationInput({ x: [2, 1] }, secret));
    assert.equal(applicationSignContent({ x: { 10: "ten", 2: "two" } }), 'x={"2":"two","10":"ten"}');
    assert.equal(applicationSignContent({ top: undefined, x: { nested: undefined, space: " " } }), 'x={"space":" "}');
});
