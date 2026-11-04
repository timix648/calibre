/** The small part of the WebExtension API the extension uses (kept local so the repository needs no @types/chrome). */
declare namespace chrome {
  namespace runtime {
    interface MessageSender { tab?: { id?: number } }
    const onMessage: {
      addListener(
        cb: (message: unknown, sender: MessageSender, sendResponse: (response: unknown) => void) => boolean | void,
      ): void;
    };
    function sendMessage(message: unknown): Promise<unknown>;
    function openOptionsPage(): Promise<void>;
  }
  namespace storage {
    interface Area {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    }
    const sync: Area;
  }
  namespace action {
    const onClicked: { addListener(cb: () => void): void };
  }
}
