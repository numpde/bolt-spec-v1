(function() {
  const {
    normalizeCheckpointState,
    buildCheckpointUrl,
    CatalogList,
    formatBoltSizeTag,
    formatBoltCatalogMeta,
    copyTextToClipboard,
    buildBoltSpecTableTsv,
  } = window;

  const STORAGE_KEY = "bolt-liked-bolts-v1";
  const MAX_LIKED_BOLTS = 24;
  const COPY_FEEDBACK_MS = 1400;
  const DELETED_TTL_MS = 24 * 60 * 60 * 1000;
  const DELETED_REFRESH_MS = 60 * 1000;
  const DELETED_MAX_OPACITY = 0.72;
  const DELETED_MIN_OPACITY = 0.18;

  const getWindow = () => (typeof window !== "undefined" ? window : null);
  const getTimestampMs = (rawValue) => {
    if (typeof rawValue !== "string" || !rawValue) {
      return null;
    }

    const parsedValue = Date.parse(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  };
  const isDeletedEntry = (entry) => Boolean(getTimestampMs(entry?.deletedAt));
  const getDeletedAgeMs = (entry, nowMs = Date.now()) => {
    const deletedAtMs = getTimestampMs(entry?.deletedAt);

    if (deletedAtMs == null) {
      return null;
    }

    return Math.max(0, nowMs - deletedAtMs);
  };
  const isExpiredEntry = (entry, nowMs = Date.now()) => {
    const deletedAgeMs = getDeletedAgeMs(entry, nowMs);
    return deletedAgeMs != null && deletedAgeMs >= DELETED_TTL_MS;
  };
  const purgeExpiredEntries = (entries, nowMs = Date.now()) => (
    entries.filter((entry) => !isExpiredEntry(entry, nowMs))
  );
  const orderLikedEntries = (entries) => {
    const activeEntries = [];
    const deletedEntries = [];

    entries.forEach((entry) => {
      if (isDeletedEntry(entry)) {
        deletedEntries.push(entry);
        return;
      }

      activeEntries.push(entry);
    });

    deletedEntries.sort((left, right) => (
      (getTimestampMs(right.deletedAt) || 0) - (getTimestampMs(left.deletedAt) || 0)
    ));

    return [...activeEntries, ...deletedEntries];
  };
  const getDeletedEntryOpacity = (entry, nowMs = Date.now()) => {
    const deletedAgeMs = getDeletedAgeMs(entry, nowMs);

    if (deletedAgeMs == null) {
      return 1;
    }

    const progress = Math.min(1, deletedAgeMs / DELETED_TTL_MS);
    return DELETED_MAX_OPACITY - (DELETED_MAX_OPACITY - DELETED_MIN_OPACITY) * progress;
  };

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

      const hydratedEntries = parsed.flatMap((entry) => {
        try {
          const checkpoint = normalizeCheckpointState(entry.checkpoint);

          return [{
            id: buildEntryId(checkpoint),
            name: typeof entry.name === "string" ? entry.name : "",
            createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
            deletedAt: typeof entry.deletedAt === "string" ? entry.deletedAt : "",
            checkpoint,
          }];
        } catch (error) {
          return [];
        }
      });

      return orderLikedEntries(purgeExpiredEntries(hydratedEntries));
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
      browserWindow.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(purgeExpiredEntries(entries))
      );
    } catch (error) {
      // Ignore persistence failures; the UI still works in-memory.
    }
  };

  const defaultNameForCheckpoint = (checkpoint) => (
    `${formatBoltSizeTag(checkpoint.draftSpec)} ${checkpoint.draftSpec.underHeadLengthMm.toFixed(1)} mm`
  );

  const getLikeAction = (entry) => {
    if (!entry) {
      return {
        label: "Save pick",
        title: "Save this bolt to My picks",
      };
    }

    if (isDeletedEntry(entry)) {
      return {
        label: "Restore pick",
        title: "Restore this saved bolt",
      };
    }

    return {
      label: "Update name",
      title: "Update the saved name for this bolt",
    };
  };

  const resolveEntryName = (entry) => (
    entry.name || defaultNameForCheckpoint(entry.checkpoint)
  );

  const formatEntryMeta = (entry) => {
    const checkpoint = entry.checkpoint;
    return formatBoltCatalogMeta(checkpoint.draftSpec);
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
  const copyIcon = (
    <svg className="panel-toolbar-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="7" y="5" width="8.5" height="10" rx="1.8" />
      <rect x="4.5" y="2.5" width="8.5" height="10" rx="1.8" />
    </svg>
  );
  const restoreIcon = (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.25 6.75H3.75V4.25" />
      <path d="M3.75 6.75A6.25 6.25 0 1 1 5.6 11.2" />
      <path d="M6 14.75L5.6 11.2L9.15 10.8" />
    </svg>
  );

  const LikedBoltForm = React.memo(({
    syncedName = null,
    submitAction,
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
          className="panel-action-button"
          type="submit"
          title={submitAction?.title || submitAction?.label || "Save pick"}
        >
          {submitAction?.label || "Save pick"}
        </button>
      </form>
    );
  });

  const LikedBoltsCardImpl = ({ currentCheckpoint, onSelectCheckpoint }) => {
    const [likedEntries, setLikedEntries] = React.useState(() => readLikedBolts());
    const [nowMs, setNowMs] = React.useState(() => Date.now());
    const [copyState, setCopyState] = React.useState("idle");
    const copyFeedbackTimerRef = React.useRef(null);

    React.useEffect(() => {
      writeLikedBolts(likedEntries);
    }, [likedEntries]);

    React.useEffect(() => {
      const timerId = window.setInterval(() => {
        const nextNowMs = Date.now();

        setNowMs(nextNowMs);
        setLikedEntries((currentEntries) => {
          const nextEntries = purgeExpiredEntries(currentEntries, nextNowMs);
          return nextEntries.length === currentEntries.length
            ? currentEntries
            : nextEntries;
        });
      }, DELETED_REFRESH_MS);

      return () => {
        window.clearInterval(timerId);
      };
    }, []);

    React.useEffect(() => () => {
      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    }, []);

    const handleDeleteEntry = React.useCallback((entryId) => {
      setLikedEntries((currentEntries) => {
        const deletedAt = new Date().toISOString();
        let didChange = false;

        const nextEntries = currentEntries.map((entry) => {
          if (entry.id !== entryId || isDeletedEntry(entry)) {
            return entry;
          }

          didChange = true;
          return {
            ...entry,
            deletedAt,
          };
        });

        return didChange ? nextEntries : currentEntries;
      });
    }, []);
    const handleRestoreEntry = React.useCallback((entryId) => {
      setLikedEntries((currentEntries) => {
        const restoredEntry = currentEntries.find((entry) => entry.id === entryId);

        if (!restoredEntry || !isDeletedEntry(restoredEntry)) {
          return currentEntries;
        }

        const nextEntry = {
          ...restoredEntry,
          deletedAt: "",
        };

        return [
          nextEntry,
          ...currentEntries.filter((entry) => entry.id !== entryId),
        ];
      });
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
    const likeAction = React.useMemo(
      () => getLikeAction(currentMatchedEntry),
      [currentMatchedEntry]
    );

    const orderedEntries = React.useMemo(
      () => orderLikedEntries(purgeExpiredEntries(likedEntries, nowMs)),
      [likedEntries, nowMs]
    );
    const activeEntries = React.useMemo(
      () => orderedEntries.filter((entry) => !isDeletedEntry(entry)),
      [orderedEntries]
    );
    const decoratedEntries = React.useMemo(() => (
      orderedEntries.map((entry) => {
        const checkpoint = normalizeCheckpointState(entry.checkpoint);
        const resolvedName = resolveEntryName({
          ...entry,
          checkpoint,
        });
        const deleted = isDeletedEntry(entry);

        return {
          ...entry,
          key: entry.id,
          checkpoint,
          title: resolvedName,
          meta: formatEntryMeta({ checkpoint }),
          onClick: () => {
            onSelectCheckpoint?.(checkpoint);
          },
          itemClassName: deleted ? "is-deleted" : "",
          itemStyle: deleted ? { opacity: getDeletedEntryOpacity(entry, nowMs) } : undefined,
          actionLabel: deleted ? `Restore ${resolvedName}` : `Delete ${resolvedName}`,
          actionIcon: deleted ? restoreIcon : deleteIcon,
          actionClassName: deleted ? "is-restore" : "",
          onActionClick: () => {
            if (deleted) {
              handleRestoreEntry(entry.id);
              return;
            }

            handleDeleteEntry(entry.id);
          },
        };
      })
    ), [handleDeleteEntry, handleRestoreEntry, nowMs, onSelectCheckpoint, orderedEntries]);

    const handleLikeCurrent = React.useCallback((rawNameDraft = "") => {
      const checkpoint = normalizeCheckpointState(currentCheckpoint);
      const id = buildEntryId(checkpoint);
      const resolvedName = String(rawNameDraft).trim() || defaultNameForCheckpoint(checkpoint);
      const nextEntry = {
        id,
        name: resolvedName,
        createdAt: new Date().toISOString(),
        deletedAt: "",
        checkpoint,
      };

      setLikedEntries((currentEntries) => [
        nextEntry,
        ...currentEntries.filter((entry) => entry.id !== id),
      ].slice(0, MAX_LIKED_BOLTS));
    }, [currentCheckpoint]);
    const handleCopyTable = React.useCallback(async () => {
      if (copyFeedbackTimerRef.current) {
        window.clearTimeout(copyFeedbackTimerRef.current);
        copyFeedbackTimerRef.current = null;
      }

      try {
        await copyTextToClipboard(
          buildBoltSpecTableTsv(
            activeEntries.map((entry) => {
              const checkpoint = normalizeCheckpointState(entry.checkpoint);

              return {
                name: resolveEntryName({
                  ...entry,
                  checkpoint,
                }),
                spec: checkpoint.draftSpec,
              };
            })
          )
        );
        setCopyState("idle");
      } catch (error) {
        setCopyState("failed");
        copyFeedbackTimerRef.current = window.setTimeout(() => {
          setCopyState("idle");
          copyFeedbackTimerRef.current = null;
        }, COPY_FEEDBACK_MS);
      }
    }, [activeEntries]);

    return (
      <section className="panel-card">
        <div className="panel-toolbar">
          <p className="eyebrow">My picks</p>
          <div className="panel-toolbar-actions">
            <button
              type="button"
              className={`panel-toolbar-button panel-toolbar-icon-button ${copyState === "failed" ? "is-failed" : ""}`}
              aria-label="Copy picks as tab-separated table"
              title="Copy picks as tab-separated table"
              disabled={!activeEntries.length}
              onClick={() => {
                void handleCopyTable();
              }}
            >
              {copyIcon}
            </button>
          </div>
        </div>
        <LikedBoltForm
          syncedName={syncedName}
          submitAction={likeAction}
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
