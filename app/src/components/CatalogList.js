(function() {
  const CatalogListImpl = ({
    ariaLabel,
    items,
    selectedKey = null,
    emptyCopy = null,
    maxHeightPx = 248,
  }) => {
    const containerRef = React.useRef(null);
    const itemRefs = React.useRef(new Map());

    React.useLayoutEffect(() => {
      if (!selectedKey) {
        return;
      }

      const container = containerRef.current;
      const selectedItem = itemRefs.current.get(selectedKey);

      if (!container || !selectedItem) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const itemRect = selectedItem.getBoundingClientRect();
      const paddingPx = 8;

      if (itemRect.top < containerRect.top) {
        container.scrollTop += itemRect.top - containerRect.top - paddingPx;
        return;
      }

      if (itemRect.bottom > containerRect.bottom) {
        container.scrollTop += itemRect.bottom - containerRect.bottom + paddingPx;
      }
    }, [items, selectedKey]);

    if (!items.length) {
      return emptyCopy
        ? <p className="catalog-list-empty">{emptyCopy}</p>
        : null;
    }

    return (
      <div
        ref={containerRef}
        className="catalog-list"
        role="list"
        aria-label={ariaLabel}
        style={{ "--catalog-list-max-height": `${maxHeightPx}px` }}
      >
        {items.map((item) => {
          const isActive = item.key === selectedKey;
          const rowClassName = `catalog-list-row ${isActive ? "is-active" : ""}`;
          const itemClassName = `catalog-list-item ${isActive ? "is-active" : ""}`;
          const content = (
            <>
              <span className="catalog-list-title">{item.title}</span>
              {item.meta ? (
                <span className="catalog-list-meta">{item.meta}</span>
              ) : null}
              {item.submeta ? (
                <span className="catalog-list-submeta">{item.submeta}</span>
              ) : null}
            </>
          );
          const handleActionClick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            item.onActionClick?.();
          };

          return (
            <div
              key={item.key}
              className={rowClassName}
              role="listitem"
            >
              {item.href ? (
                <a
                  ref={(node) => {
                    if (node) {
                      itemRefs.current.set(item.key, node);
                    } else {
                      itemRefs.current.delete(item.key);
                    }
                  }}
                  className={itemClassName}
                  href={item.href}
                  aria-current={isActive ? "true" : undefined}
                  onClick={item.onClick}
                >
                  {content}
                </a>
              ) : (
                <button
                  ref={(node) => {
                    if (node) {
                      itemRefs.current.set(item.key, node);
                    } else {
                      itemRefs.current.delete(item.key);
                    }
                  }}
                  className={itemClassName}
                  type="button"
                  aria-pressed={isActive}
                  onClick={item.onClick}
                >
                  {content}
                </button>
              )}
              {item.onActionClick ? (
                <button
                  className="catalog-list-item-action"
                  type="button"
                  aria-label={item.actionLabel}
                  title={item.actionLabel}
                  onClick={handleActionClick}
                >
                  {item.actionIcon}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  window.CatalogList = React.memo(CatalogListImpl);
})();
