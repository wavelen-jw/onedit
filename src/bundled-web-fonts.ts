// Restricted runtime: only the pinned Noto fallback families are bundled.
export const bundledWebFonts = [
  {
    "family": "Noto Serif KR",
    "aliases": [],
    "files": [
      {
        "file": "NotoSerifKR-Regular.woff2",
        "weight": "400",
        "SHA256": "c9a1e3ac69994d680883b53b1fd83d520733b704792522a932bfaa276117de45"
      },
      {
        "file": "NotoSerifKR-Bold.woff2",
        "weight": "700",
        "SHA256": "504d6af6abb882acd912d47bafa383c4512a6c8c33635e4e8fb37111d9310941"
      }
    ]
  },
  {
    "family": "Noto Sans KR",
    "aliases": [],
    "files": [
      {
        "file": "NotoSansKR-Regular.woff2",
        "weight": "400",
        "SHA256": "d1bf8649914a4fe9477a8735bf056383e44e466141fb3d61897252e06d900c1a"
      },
      {
        "file": "NotoSansKR-Bold.woff2",
        "weight": "700",
        "SHA256": "dab3d492daa687386292cff1499225db580f931f800ee0d124eb0636378c6020"
      }
    ]
  },
  {
    "family": "Noto Sans KR ExtraLight",
    "aliases": [],
    "files": [
      {
        "file": "NotoSansKR-ExtraLight.woff2",
        "weight": "400",
        "SHA256": "3b5cac6af73fd94fa91ded10f6cfc54c7ce52189986fe7ca6fd457208f1d3673"
      }
    ]
  }
] as const;
