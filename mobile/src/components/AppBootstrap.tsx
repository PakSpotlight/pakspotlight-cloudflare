import { useEffect } from "react";
import { getExpoPushToken } from "../src/lib/notifications";

export default function AppBootstrap() {
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const token = await getExpoPushToken();
      if (mounted && token) {
        console.log("Expo push token:", token);
      }
    };

    void init();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
