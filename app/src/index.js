(function() {
  const root = ReactDOM.createRoot(document.getElementById("root"));

  const renderBootError = (copy) => {
    root.render(
      React.createElement(
        "div",
        { className: "app-shell" },
        React.createElement(
          "main",
          { className: "preview-column" },
          React.createElement(
            "section",
            { className: "preview-card" },
            React.createElement(
              "div",
              { className: "card-heading" },
              React.createElement(
                "div",
                null,
                React.createElement("p", { className: "eyebrow" }, "Preset catalog")
              )
            ),
            React.createElement("p", { className: "card-copy" }, copy)
          )
        )
      )
    );
  };

  const boot = async () => {
    try {
      await Promise.all([
        window.loadBoltPresetCatalog(),
        window.loadBoltThreadStandardsCatalog(),
      ]);
      root.render(React.createElement(window.App, null));
    } catch (error) {
      console.error("Failed to load bolt app catalogs", error);
      renderBootError(
        "A preset or standards YAML file could not be read. Check the console and the static file paths."
      );
    }
  };

  boot();
})();
