(function() {
  const root = ReactDOM.createRoot(document.getElementById("root"));

  const renderShellMessage = (title, copy) => {
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
                React.createElement("p", { className: "eyebrow" }, "Preset catalog"),
                React.createElement("h2", null, title)
              )
            ),
            React.createElement("p", { className: "card-copy" }, copy)
          )
        )
      )
    );
  };

  const boot = async () => {
    renderShellMessage("Loading...", "Reading the preset catalog from YAML.");

    try {
      await window.loadBoltPresetCatalog();
      root.render(React.createElement(window.App, null));
    } catch (error) {
      console.error("Failed to load bolt preset catalog", error);
      renderShellMessage(
        "Catalog load failed",
        "The preset YAML could not be read. Check the console and the static file path."
      );
    }
  };

  boot();
})();
