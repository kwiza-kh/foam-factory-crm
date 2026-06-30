import { useI18n } from "../App.jsx";
import { filterValue, normalizeOrderStatus } from "../lib/app-utils.jsx";

export function ColumnHeader(props) {
  const t = props.context?.t || (() => (text) => text);
  const isFiltered = props.context?.activeFilterFields?.has(props.column.getColId());
  const field = props.column.getColId();

  const openFilter = (event) => {
    event.stopPropagation();
    const optionValues = props.column.getColDef?.()?.cellEditorParams?.values;
    props.context?.openColumnFilter(
      props.column.getColId(),
      props.displayName,
      event.currentTarget.getBoundingClientRect(),
      Array.isArray(optionValues) ? optionValues : null,
    );
  };

  const startColumnSelection = (event) => {
    props.context?.startColumnSelection?.(field, event);
  };

  const updateColumnSelection = (event) => {
    props.context?.updateColumnSelection?.(field, event);
  };

  const openHeaderContextMenu = (event) => {
    event.preventDefault();
    props.context?.openHeaderContextMenu?.(field, event);
  };

  return (
    <div
      className={`column-header ${isFiltered ? "is-filtered" : ""}`}
      onMouseDown={startColumnSelection}
      onMouseEnter={updateColumnSelection}
      onContextMenu={openHeaderContextMenu}
    >
      <button
        className="column-header-label"
        type="button"
        onClick={(event) => event.preventDefault()}
        title={`${props.displayName}${isFiltered ? t("（已筛选）") : ""}`}
      >
        {props.displayName}
      </button>
      <button
        className={`column-filter-button ${isFiltered ? "is-active" : ""}`}
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={openFilter}
        title={isFiltered ? t("已筛选，点击修改筛选") : t("筛选")}
      >
        ▾
      </button>
    </div>
  );
}
