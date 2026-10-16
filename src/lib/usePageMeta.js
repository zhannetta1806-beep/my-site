import { useEffect } from "react";

export function usePageMeta(title, robots = "") {
  useEffect(() => {
    document.title = title;
    let meta = document.querySelector('meta[name="robots"]');
    if (robots) {
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "robots");
        document.head.append(meta);
      }
      meta.setAttribute("content", robots);
    } else if (meta) {
      meta.remove();
    }
  }, [title, robots]);
}
