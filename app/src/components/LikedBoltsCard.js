(function() {
  const {
    normalizeCheckpointState,
    buildCheckpointUrl,
    CatalogList,
    formatBoltSizeTag,
    formatBoltCatalogMeta,
  } = window;

  const STORAGE_KEY = "bolt-liked-bolts-v1";
  const MAX_LIKED_BOLTS = 24;

  const getWindow = () => (typeof window !== "undefined" ? window : null);

  const buildEntryId = (checkpoint) => (
    buildCheckpointUrl(checkpoint, getWindow()?.location || { pathname: "/" })
  );

  const readLikedBolts = () => {
    const browserWindow = getWindow();

    if (!browserWindow?.localStorage) {
      return [];
    }

    try {
      const raw = browserWindow.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.flatMap((entry) => {
        try {
          const checkpoint = normalizeCheckpointState(entry.checkpoint);

          return [{
            id: buildEntryId(checkpoint),
            name: typeof entry.name === "string" ? entry.name : "",
            createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
            checkpoint,
          }];
        } catch (error) {
          return [];
        }
      });
    } catch (error) {
      return [];
    }
  };

  const writeLikedBolts = (entries) => {
    const browserWindow = getWindow();

    if (!browserWindow?.localStorage) {
      return;
    }

    try {
      browserWindow.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      // Ignore persistence failures; the UI still works in-memory.
    }
  };

  const defaultNameForCheckpoint = (checkpoint) => (
    `${formatBoltSizeTag(checkpoint.draftSpec, checkpoint.presetName)} ${checkpoint.draftSpec.underHeadLengthMm.toFixed(1)} mm`
  );

  const resolveEntryName = (entry) => (
    entry.name || defaultNameForCheckpoint(entry.checkpoint)
  );

  const formatEntryMeta = (entry) => {
    const checkpoint = entry.checkpoint;
    return formatBoltCatalogMeta(checkpoint.draftSpec, checkpoint.presetName);
  };

  const deleteIcon = (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4.5 5.5H15.5" />
      <path d="M7.5 5.5V4.5C7.5 3.95 7.95 3.5 8.5 3.5H11.5C12.05 3.5 12.5 3.95 12.5 4.5V5.5" />
      <path d="M6.5 5.5L7 15C7.05 15.58 7.53 16 8.11 16H11.89C12.47 16 12.95 15.58 13 15L13.5 5.5" />
      <path d="M8.5 8V13" />
      <path d="M11.5 8V13" />
    </svg>
  );

  const LikedBoltForm = React.memo(({
    syncedName = null,
    onSubmitName,
  }) => {
    const [nameDraft, setNameDraft] = React.useState("");

    React.useEffect(() => {
      if (typeof syncedName !== "string") {
        return;
      }

      setNameDraft((currentNameDraft) => (
        currentNameDraft === syncedName ? currentNameDraft : syncedName
      ));
    }, [syncedName]);

    const handleSubmit = React.useCallback((event) => {
      event.preventDefault();
      onSubmitName?.(nameDraft);
    }, [nameDraft, onSubmitName]);

    return (
      <form className="liked-bolt-form" onSubmit={handleSubmit}>
        <input
          className="liked-bolt-name-input"
          type="text"
          placeholder="Name this bolt"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
        />
        <button
          className="liked-bolt-button"
          type="submit"
        >
          I like it!
        </button>
      </form>
    );
  });

  const LikedBoltsCardImpl = ({ currentCheckpoint, onSelectCheckpoint }) => {
    const [likedEntries, setLikedEntries] = React.useState(() => readLikedBolts());

    React.useEffect(() => {
      writeLikedBolts(likedEntries);
    }, [likedEntries]);

    const handleDeleteEntry = React.useCallback((entryId) => {
      setLikedEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== entryId));
    }, []);

    const currentEntryId = React.useMemo(
      () => buildEntryId(normalizeCheckpointState(currentCheckpoint)),
      [currentCheckpoint]
    );
    const currentMatchedEntry = React.useMemo(() => (
      likedEntries.find((entry) => entry.id === currentEntryId) || null
    ), [currentEntryId, likedEntries]);
    const syncedName = React.useMemo(() => {
      if (!currentMatchedEntry) {
        return null;
      }

      return resolveEntryName({
        ...currentMatchedEntry,
        checkpoint: normalizeCheckpointState(currentMatchedEntry.checkpoint),
      });
    }, [currentMatchedEntry]);

    const decoratedEntries = React.useMemo(() => (
      likedEntries.map((entry) => {
        const checkpoint = normalizeCheckpointState(entry.checkpoint);
        const resolvedName = resolveEntryName({
          ...entry,
          checkpoint,
        });

        return {
          ...entry,
          key: entry.id,
          checkpoint,
          title: resolvedName,
          meta: formatEntryMeta({ checkpoint }),
          onClick: () => {
            onSelectCheckpoint?.(checkpoint);
          },
          actionLabel: `Delete ${resolvedName}`,
          actionIcon: deleteIcon,
          onActionClick: () => handleDeleteEntry(entry.id),
        };
      })
    ), [handleDeleteEntry, likedEntries, onSelectCheckpoint]);

    const handleLikeCurrent = React.useCallback((rawNameDraft = "") => {
      const checkpoint = normalizeCheckpointState(currentCheckpoint);
      const id = buildEntryId(checkpoint);
      const resolvedName = String(rawNameDraft).trim() || defaultNameForCheckpoint(checkpoint);
      const nextEntry = {
        id,
        name: resolvedName,
        createdAt: new Date().toISOString(),
        checkpoint,
      };

      setLikedEntries((currentEntries) => [
        nextEntry,
        ...currentEntries.filter((entry) => entry.id !== id),
      ].slice(0, MAX_LIKED_BOLTS));
    }, [currentCheckpoint]);

    return (
      <section className="panel-card">
        <p className="eyebrow">My picks</p>
        <LikedBoltForm
          syncedName={syncedName}
          onSubmitName={handleLikeCurrent}
        />

        <CatalogList
          ariaLabel="My picks"
          items={decoratedEntries}
          selectedKey={currentEntryId}
          emptyCopy="Nothing saved yet."
          maxHeightPx={320}
        />
      </section>
    );
  };

  window.LikedBoltsCard = React.memo(LikedBoltsCardImpl);
})();
