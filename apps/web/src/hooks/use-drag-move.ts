import { useState, type DragEvent } from "react";

const MIME = "application/x-familywall-move";

/**
 * Drag and drop to move things between days (events, dishes, shifts), with the browser's own drag
 * and drop: mouse on computers, long press on tablets and phones that support it.
 * `source(id)` goes on what is dragged, `target(key)` on each day; `onMove(id, key)` runs on drop.
 */
export const useDragMove = (onMove: (id: string, targetKey: string) => void) => {
  const [overKey, setOverKey] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(MIME);

  return {
    draggingId,
    isOver: (key: string) => overKey === key,
    source: (id: string) => ({
      draggable: true,
      onDragStart: (event: DragEvent) => {
        event.dataTransfer.setData(MIME, id);
        event.dataTransfer.effectAllowed = "move";
        setDraggingId(id);
      },
      onDragEnd: () => {
        setDraggingId(null);
        setOverKey(null);
      }
    }),
    target: (key: string) => ({
      onDragOver: (event: DragEvent) => {
        if (accepts(event)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setOverKey(key);
        }
      },
      onDragLeave: (event: DragEvent) => {
        // Leaving for a child of the same day is not leaving the day.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOverKey((current) => (current === key ? null : current));
        }
      },
      onDrop: (event: DragEvent) => {
        if (!accepts(event)) {
          return;
        }
        event.preventDefault();
        const id = event.dataTransfer.getData(MIME);
        setOverKey(null);
        setDraggingId(null);
        if (id) {
          onMove(id, key);
        }
      }
    })
  };
};
