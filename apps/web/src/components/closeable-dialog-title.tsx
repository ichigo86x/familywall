import { Button, DialogTitle, DialogTrigger } from "@fluentui/react-components";

import { DismissRegular } from "@/lib/fluent-icons";

/** Dialog title with a large close button, so every dialog can be dismissed with one tap. */
export const CloseableDialogTitle = ({ children }: { children: React.ReactNode }) => (
  <DialogTitle
    action={
      <DialogTrigger action="close">
        <Button appearance="subtle" className="dialog-close" aria-label="Chiudi" icon={<DismissRegular />} />
      </DialogTrigger>
    }
  >
    {children}
  </DialogTitle>
);
