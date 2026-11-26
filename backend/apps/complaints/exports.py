import io

from openpyxl import Workbook
from openpyxl.styles import Font


def build_xlsx(headers: list[str], rows) -> bytes:
    """Single-sheet workbook. Cell values arrive already neutralised against formula injection (see _csv_safe),
    and are written as strings or numbers only."""
    wb = Workbook(write_only=True)
    ws = wb.create_sheet("Complaints")
    ws.freeze_panes = "A2"
    from openpyxl.cell import WriteOnlyCell

    head = []
    for h in headers:
        cell = WriteOnlyCell(ws, value=h)
        cell.font = Font(bold=True)
        head.append(cell)
    ws.append(head)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
