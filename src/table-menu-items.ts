type RowColumnItem = { label: string; key?: string };

export const rowColumnItems = {
  "add-dialog": { label: "줄/칸 추가하기…", key: "Alt+Insert" },
  "row-add": { label: "아래 행 추가" },
  "col-add": { label: "오른쪽 열 추가" },
  "delete-dialog": { label: "줄/칸 지우기…", key: "Alt+Delete" },
  "row-delete": { label: "현재 행 삭제 (내용 포함)" },
  "col-delete": { label: "현재 열 삭제 (내용 포함)" },
} satisfies Record<string, RowColumnItem>;

export const rowColumnMenuGroups = {
  add: ["add-dialog", "row-add", "col-add"],
  remove: ["delete-dialog", "row-delete", "col-delete"],
} as const;

export function rowColumnItem(id: keyof typeof rowColumnItems): RowColumnItem {
  return rowColumnItems[id];
}
