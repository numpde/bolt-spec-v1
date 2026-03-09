(function() {
  const CatalogListImpl = ({
    ariaLabel,
    items,
    selectedKey = null,
    emptyCopy = null,
    maxHeightPx = 248,
  }) => {
    if (!items.length) {
      return emptyCopy
        ? <p className="catalog-list-empty">{emptyCopy}</p>
        : null;
    }

    return (
      <div
        className="catalog-list"
        role="list"
        aria-label={ariaLabel}
        style={{ "--catalog-list-max-height": `${maxHeightPx}px` }}
      >
        {items.map((item) => {
          const isActive = item.key === selectedKey;
          const className = `catalog-list-item ${isActive ? "is-active" : ""}`;

          if (item.href) {
            return (
              <a
                key={item.key}
                className={className}
                href={item.href}
                role="listitem"
                aria-current={isActive ? "true" : undefined}
                onClick={item.onClick}
              >
                <span className="catalog-list-title">{item.title}</span>
                {item.meta ? (
                  <span className="catalog-list-meta">{item.meta}</span>
                ) : null}
                {item.submeta ? (
                  <span className="catalog-list-submeta">{item.submeta}</span>
                ) : null}
              </a>
            );
          }

          return (
            <button
              key={item.key}
              className={className}
              type="button"
              role="listitem"
              aria-pressed={isActive}
              onClick={item.onClick}
            >
              <span className="catalog-list-title">{item.title}</span>
              {item.meta ? (
                <span className="catalog-list-meta">{item.meta}</span>
              ) : null}
              {item.submeta ? (
                <span className="catalog-list-submeta">{item.submeta}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  };

  window.CatalogList = React.memo(CatalogListImpl);
})();
