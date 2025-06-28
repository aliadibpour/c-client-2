// useIsVisible.ts
import { useEffect, useState } from "react";
import { ViewToken } from "react-native";

export function useIsVisible(viewableItems: ViewToken[], itemId: number) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isVisible = viewableItems.some(
      (item) => item.item.id === itemId
    );
    setVisible(isVisible);
  }, [viewableItems, itemId]);

  return visible;
}
