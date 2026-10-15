import {
type ReactNode
} from "react";

import {
Modal
} from "@heroui/react";




export function Overlay({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.CloseTrigger aria-label="Close dialog" onPress={onClose} />
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
            {footer && <Modal.Footer>{footer}</Modal.Footer>}
          </Modal.Dialog>
        </Modal.Container>
    </Modal.Backdrop>
  );
}
