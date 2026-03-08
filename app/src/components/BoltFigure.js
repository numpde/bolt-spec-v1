(function() {
  const { renderBoltFigureSvg } = window;
  const WHEEL_LOCK_TTL_MS = 420;

  const BoltFigure = ({ spec, onAdjustField, showTopView = true }) => {
    const containerRef = React.useRef(null);
    const wheelLockUntilRef = React.useRef(0);

    React.useEffect(() => {
      const handleWindowWheel = (event) => {
        if (Date.now() >= wheelLockUntilRef.current) {
          return;
        }

        if (event.cancelable) {
          event.preventDefault();
        }
      };

      window.addEventListener("wheel", handleWindowWheel, {
        passive: false,
        capture: true,
      });

      return () => {
        window.removeEventListener("wheel", handleWindowWheel, {
          capture: true,
        });
      };
    }, []);

    React.useEffect(() => {
      if (!containerRef.current || !onAdjustField) {
        return undefined;
      }

      const zoneElements = Array.from(
        containerRef.current.querySelectorAll("[data-field-name]")
      );

      const cleanupFns = zoneElements.map((element) => {
        const handleWheel = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const fieldName = element.getAttribute("data-field-name");
          const direction = event.deltaY < 0 ? 1 : -1;
          wheelLockUntilRef.current = Date.now() + WHEEL_LOCK_TTL_MS;
          onAdjustField(fieldName, direction);
        };

        element.addEventListener("wheel", handleWheel, { passive: false });

        return () => {
          element.removeEventListener("wheel", handleWheel);
        };
      });

      return () => {
        cleanupFns.forEach((cleanup) => cleanup());
      };
    }, [spec, onAdjustField]);

    return (
      <div
        ref={containerRef}
        className="figure-wrap"
        dangerouslySetInnerHTML={{ __html: renderBoltFigureSvg(spec, { showTopView }) }}
      />
    );
  };

  window.BoltFigure = BoltFigure;
})();
