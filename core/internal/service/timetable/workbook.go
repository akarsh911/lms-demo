package timetable

import (
	"bytes"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/xuri/excelize/v2"
)

const (
	SheetNameRunes = 31

	WorkbookMediaType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

	headerRow      = 5
	firstBodyRow   = headerRow + 1
	periodColumn   = 1
	timeColumn     = 2
	firstDayColumn = 3
)

var sheetNameForbidden = strings.NewReplacer(
	"[", " ", "]", " ", ":", " ", "*", " ", "?", " ", "/", " ", "\\", " ",
)

func SanitiseSheetName(raw string) string {
	name := strings.TrimSpace(sheetNameForbidden.Replace(raw))
	name = strings.Join(strings.Fields(name), " ")
	name = strings.Trim(name, "'")
	name = strings.TrimSpace(name)
	name = truncateRunes(name, SheetNameRunes)
	if name == "" {
		return "Sheet"
	}
	if strings.EqualFold(name, "History") {
		return "History class"
	}
	return name
}

func truncateRunes(in string, limit int) string {
	if utf8.RuneCountInString(in) <= limit {
		return in
	}
	count := 0
	for index := range in {
		if count == limit {
			return strings.TrimSpace(in[:index])
		}
		count++
	}
	return in
}

type sheetNamer struct {
	taken map[string]bool
}

func newSheetNamer() *sheetNamer { return &sheetNamer{taken: map[string]bool{}} }

func (n *sheetNamer) name(raw string) string {
	base := SanitiseSheetName(raw)
	if !n.taken[strings.ToLower(base)] {
		n.taken[strings.ToLower(base)] = true
		return base
	}
	for attempt := 2; ; attempt++ {
		suffix := " (" + strconv.Itoa(attempt) + ")"
		trimmed := truncateRunes(base, SheetNameRunes-utf8.RuneCountInString(suffix))
		candidate := strings.TrimSpace(trimmed) + suffix
		if !n.taken[strings.ToLower(candidate)] {
			n.taken[strings.ToLower(candidate)] = true
			return candidate
		}
	}
}

func (e Export) SheetTitle(sheet ExportSheet) string {
	name := strings.TrimSpace(sheet.GradeName + " " + sheet.SectionName)
	if name == "" {
		return sheet.SectionCode
	}
	return name
}

func (e Export) Workbook() (*bytes.Buffer, error) {
	if len(e.Sheets) == 0 {
		return nil, ErrExportEmpty
	}

	file := excelize.NewFile()
	defer file.Close()

	styles, err := newWorkbookStyles(file)
	if err != nil {
		return nil, err
	}

	namer := newSheetNamer()
	first := ""
	for _, sheet := range e.Sheets {
		name := namer.name(e.SheetTitle(sheet))
		if _, err := file.NewSheet(name); err != nil {
			return nil, err
		}
		if first == "" {
			first = name
		}
		if err := e.writeSheet(file, name, sheet, styles); err != nil {
			return nil, err
		}
	}

	if err := file.DeleteSheet(file.GetSheetName(0)); err != nil {
		return nil, err
	}
	if index, err := file.GetSheetIndex(first); err == nil {
		file.SetActiveSheet(index)
	}
	return file.WriteToBuffer()
}

type workbookStyles struct {
	title   int
	caption int
	header  int
	period  int
	clock   int
	cell    int
	quiet   int
}

func newWorkbookStyles(file *excelize.File) (workbookStyles, error) {
	var styles workbookStyles
	var err error

	styles.title, err = file.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true, Size: 14},
	})
	if err != nil {
		return styles, err
	}

	styles.caption, err = file.NewStyle(&excelize.Style{
		Font: &excelize.Font{Italic: true, Size: 10, Color: "595959"},
	})
	if err != nil {
		return styles, err
	}

	bordered := []excelize.Border{
		{Type: "left", Style: 1, Color: "BFBFBF"},
		{Type: "right", Style: 1, Color: "BFBFBF"},
		{Type: "top", Style: 1, Color: "BFBFBF"},
		{Type: "bottom", Style: 1, Color: "BFBFBF"},
	}

	styles.header, err = file.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"DDEBF7"}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
		Border:    bordered,
	})
	if err != nil {
		return styles, err
	}

	styles.period, err = file.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true},
		Alignment: &excelize.Alignment{Vertical: "center", WrapText: true},
		Border:    bordered,
	})
	if err != nil {
		return styles, err
	}

	styles.clock, err = file.NewStyle(&excelize.Style{
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		Border:    bordered,
	})
	if err != nil {
		return styles, err
	}

	styles.cell, err = file.NewStyle(&excelize.Style{
		Alignment: &excelize.Alignment{Vertical: "top", WrapText: true},
		Border:    bordered,
	})
	if err != nil {
		return styles, err
	}

	styles.quiet, err = file.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Italic: true, Color: "808080"},
		Fill:      excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{"F2F2F2"}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
		Border:    bordered,
	})
	return styles, err
}

func (e Export) writeSheet(file *excelize.File, name string, sheet ExportSheet,
	styles workbookStyles) error {

	set := func(column, row int, value string) error {
		ref, err := excelize.CoordinatesToCellName(column, row)
		if err != nil {
			return err
		}
		return file.SetCellStr(name, ref, value)
	}
	style := func(fromColumn, fromRow, toColumn, toRow, id int) error {
		from, err := excelize.CoordinatesToCellName(fromColumn, fromRow)
		if err != nil {
			return err
		}
		to, err := excelize.CoordinatesToCellName(toColumn, toRow)
		if err != nil {
			return err
		}
		return file.SetCellStyle(name, from, to, id)
	}

	lastColumn := firstDayColumn + len(sheet.Columns) - 1
	if lastColumn < timeColumn {
		lastColumn = timeColumn
	}

	if err := set(periodColumn, 1, e.SheetTitle(sheet)); err != nil {
		return err
	}
	if err := style(periodColumn, 1, periodColumn, 1, styles.title); err != nil {
		return err
	}
	if err := set(periodColumn, 2, captionOf(sheet)); err != nil {
		return err
	}
	if err := set(periodColumn, 3, e.Subtitle); err != nil {
		return err
	}
	if err := style(periodColumn, 2, periodColumn, 3, styles.caption); err != nil {
		return err
	}

	if err := set(periodColumn, headerRow, "Period"); err != nil {
		return err
	}
	if err := set(timeColumn, headerRow, "Time"); err != nil {
		return err
	}
	for index, column := range sheet.Columns {
		title := column.Title
		if column.Note != "" {
			title += "\n" + column.Note
		}
		if err := set(firstDayColumn+index, headerRow, title); err != nil {
			return err
		}
	}
	if err := style(periodColumn, headerRow, lastColumn, headerRow, styles.header); err != nil {
		return err
	}
	if err := file.SetRowHeight(name, headerRow, 30); err != nil {
		return err
	}

	keyAt := map[string]int{}
	for index, column := range sheet.Columns {
		keyAt[column.Key] = firstDayColumn + index
	}

	for index, row := range sheet.Rows {
		at := firstBodyRow + index
		label := row.PeriodName
		if row.PeriodCode != "" && !strings.EqualFold(label, row.PeriodCode) {
			label = row.PeriodCode + " · " + row.PeriodName
		}
		if err := set(periodColumn, at, label); err != nil {
			return err
		}
		if err := set(timeColumn, at, row.Time); err != nil {
			return err
		}
		if err := style(periodColumn, at, periodColumn, at, styles.period); err != nil {
			return err
		}
		if err := style(timeColumn, at, timeColumn, at, styles.clock); err != nil {
			return err
		}
		if err := style(firstDayColumn, at, lastColumn, at, styles.cell); err != nil {
			return err
		}

		for key, column := range keyAt {
			cell := row.Cells[key]
			if cell.Empty() {
				continue
			}
			if err := set(column, at, strings.Join(cell.Lines(), "\n")); err != nil {
				return err
			}
			if cell.Subject == "" && cell.Teacher == "" {
				if err := style(column, at, column, at, styles.quiet); err != nil {
					return err
				}
			}
		}
		if err := file.SetRowHeight(name, at, 46); err != nil {
			return err
		}
	}

	if err := file.SetColWidth(name, "A", "A", 20); err != nil {
		return err
	}
	if err := file.SetColWidth(name, "B", "B", 13); err != nil {
		return err
	}
	if len(sheet.Columns) > 0 {
		from, err := excelize.ColumnNumberToName(firstDayColumn)
		if err != nil {
			return err
		}
		to, err := excelize.ColumnNumberToName(lastColumn)
		if err != nil {
			return err
		}
		if err := file.SetColWidth(name, from, to, 24); err != nil {
			return err
		}
	}

	frozen, err := excelize.CoordinatesToCellName(firstDayColumn, firstBodyRow)
	if err != nil {
		return err
	}
	return file.SetPanes(name, &excelize.Panes{
		Freeze:      true,
		XSplit:      timeColumn,
		YSplit:      headerRow,
		TopLeftCell: frozen,
		ActivePane:  "bottomRight",
	})
}

func captionOf(sheet ExportSheet) string {
	parts := make([]string, 0, 2)
	if sheet.SectionCode != "" {
		parts = append(parts, sheet.SectionCode)
	}
	if sheet.Subtitle != "" {
		parts = append(parts, sheet.Subtitle)
	}
	return strings.Join(parts, " · ")
}
