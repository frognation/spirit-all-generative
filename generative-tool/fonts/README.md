# Custom Fonts Directory

Place font files here (.ttf, .otf, .woff, .woff2) and register them in `fonts.json`.

## fonts.json Format

```json
[
  { "name": "My Font", "file": "MyFont-Regular.woff2" },
  { "name": "My Font Bold", "file": "MyFont-Bold.woff2" }
]
```

- **name**: Font dropdown display name / 드롭다운에 표시될 이름
- **file**: Filename in this folder / 이 폴더 안의 파일 이름

The `name` field is also used as the CSS `font-family` value.
Tool will auto-register `@font-face` and add to the dropdown on page load.
