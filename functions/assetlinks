Deno.serve((req) => {
    const jsonContent = [{
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {
            "namespace": "android_app",
            "package_name": "co.median.android.odxqpdqy",
            "sha256_cert_fingerprints": [
                "E8:E9:3B:C7:40:27:C0:88:46:04:3A:D2:91:F8:6C:AC:D0:D9:EA:33:98:2A:F6:F4:74:E6:AD:30:21:26:70:DE"
            ]
        }
    }];

    return new Response(JSON.stringify(jsonContent, null, 2), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
});