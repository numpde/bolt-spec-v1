(function() {
  const {
    normalizeCheckpointState,
    buildCheckpointUrl,
    CatalogList,
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
            id: typeof entry.id === "string" ? entry.id : buildEntryId(checkpoint),
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
    `${checkpoint.presetName.toUpperCase()} ${checkpoint.draftSpec.underHeadLengthMm.toFixed(1)} mm`
  );

  const formatEntryMeta = (entry) => {
    const checkpoint = entry.checkpoint;
    const length = checkpoint.draftSpec.underHeadLengthMm.toFixed(1);

    return `${checkpoint.presetName.toUpperCase()} · ${length} mm`;
  };

  const LikedBoltsCardImpl = ({ currentCheckpoint, onSelectCheckpoint }) => {
    const [likedEntries, setLikedEntries] = React.useState(() => readLikedBolts());
    const [nameDraft, setNameDraft] = React.useState("");

    React.useEffect(() => {
      writeLikedBolts(likedEntries);
    }, [likedEntries]);

    const decoratedEntries = React.useMemo(() => (
      likedEntries.map((entry) => {
        const checkpoint = normalizeCheckpointState(entry.checkpoint);
        const href = buildCheckpointUrl(checkpoint, getWindow()?.location || { pathname: "/" });

        return {
          ...entry,
          key: entry.id,
          checkpoint,
          title: entry.name || defaultNameForCheckpoint(checkpoint),
          meta: formatEntryMeta({ checkpoint }),
          submeta: href,
          onClick: () => onSelectCheckpoint?.(checkpoint),
        };
      })
    ), [likedEntries, onSelectCheckpoint]);

    const currentEntryId = React.useMemo(
      () => buildEntryId(normalizeCheckpointState(currentCheckpoint)),
      [currentCheckpoint]
    );

    const handleLikeCurrent = React.useCallback(() => {
      const checkpoint = normalizeCheckpointState(currentCheckpoint);
      const id = buildEntryId(checkpoint);
      const nextEntry = {
        id,
        name: nameDraft.trim() || defaultNameForCheckpoint(checkpoint),
        createdAt: new Date().toISOString(),
        checkpoint,
      };

      setLikedEntries((currentEntries) => [
        nextEntry,
        ...currentEntries.filter((entry) => entry.id !== id),
      ].slice(0, MAX_LIKED_BOLTS));
      setNameDraft("");
    }, [currentCheckpoint, nameDraft]);

    return (
      <section className="panel-card">
        <p className="eyebrow">Liked bolts</p>
        <p className="card-copy">
          Keep versions you want to come back to.
        </p>
        <div className="liked-bolt-form">
          <input
            className="liked-bolt-name-input"
            type="text"
            placeholder="Name this bolt"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
          />
          <button
            className="liked-bolt-button"
            type="button"
            onClick={handleLikeCurrent}
          >
            I like it!
          </button>
        </div>

        <CatalogList
          ariaLabel="Liked bolts"
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
