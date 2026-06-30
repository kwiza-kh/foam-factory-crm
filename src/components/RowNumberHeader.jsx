export function RowNumberHeader(props) {
  const t = props.context?.t || ((text) => text);
  const selectAllRows = (event) => {
    event.preventDefault();
    event.stopPropagation();
    props.context?.selectAllRows?.();
  };

  return (
    <button
      className="row-number-header-button"
      type="button"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={selectAllRows}
      title={t("选中所有可见行")}
    >
      #
    </button>
  );
}
