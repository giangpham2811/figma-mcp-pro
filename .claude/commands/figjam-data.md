---
description: Vẽ mô hình dữ liệu lên FigJam — bảng, khoá, quan hệ chân quạ (ERD)
argument-hint: "<miền dữ liệu> [@file schema hoặc spec]"
allowed-tools: Read, Glob, Grep, AskUserQuestion, mcp__reqwise-figma__figma_status, mcp__reqwise-figma__figma_read, mcp__reqwise-figma__figma_diagram, mcp__reqwise-figma__figma_docs
---

# /figjam-data — $ARGUMENTS

`type: "erd"`. Bảng, cột, khoá, quan hệ chân quạ.

## Đọc trước, hỏi sau

Nếu repo đã có schema thật — `schema.prisma`, file migration, `CREATE
TABLE`, model của ORM — thì **đọc nó** thay vì phỏng vấn. Grep tìm trước khi
hỏi bất cứ điều gì.

Chỉ hỏi những gì schema không nói được:

- bảng nào **thuộc phạm vi** bản vẽ này (một ERD 40 bảng không ai đọc);
- quan hệ nào quan trọng với **nghiệp vụ**, chứ không chỉ tồn tại trong DB;
- cột nào là thuật ngữ nghiệp vụ, cột nào là chi tiết kỹ thuật bỏ được.

Nếu chưa có schema thì đây là buổi **thiết kế**, không phải buổi chép: hỏi
danh từ nghiệp vụ trước, kiểu dữ liệu sau. Đừng bắt người dùng nghĩ ra
`VARCHAR(255)` khi họ đang nói về "khách hàng".

## Trên board trông thế nào

Entity là hình trụ (`ENG_DATABASE`) — ký hiệu board vốn dùng cho bảng. Danh
sách cột thành chữ bên trong hộp, **giữ nguyên nhãn PK/FK**: khoá mà không
ai nhìn thấy là thứ duy nhất một ERD không được phép làm mất.

Không có ngăn riêng cho từng cột như bản Design. Nói trước để người dùng
không tưởng là lỗi.

## Checker sẽ bắt gì

Đúng những thứ cắn bạn sau một lần migrate:

- bảng không có khoá chính;
- khoá ngoại trỏ tới cột không tồn tại;
- quan hệ nhiều-nhiều không có bảng nối;
- quan hệ trỏ tới bảng đã đổi tên.

Đó là lý do đáng vẽ ERD **trước khi** code, chứ không phải để có cái hình
dán vào tài liệu.

## Trước khi vẽ

```
mcp__reqwise-figma__figma_status
```

`pluginConnected: false` → dừng. Bảo người dùng mở Figma Desktop, chạy plugin
**Reqwise Figma MCP**, giữ cửa sổ plugin mở.

Luôn dùng `options: { checkFirst: true }` — kiểm model trước, chỉ vẽ khi
sạch. Cú pháp compact: `figma_docs({ section: "erd" })`.

## Báo cáo

Đã vẽ gì và ở đâu · checker tìm thấy gì · **bảng nào bạn cố ý bỏ ngoài phạm
vi** · chỗ nào lấy từ schema thật và chỗ nào là thiết kế mới trong buổi này.
Hai chỗ cuối là thứ chỉ bạn biết.
