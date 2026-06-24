import GiftRevealModal, {
  type GiftRevealModalProps,
} from "@/components/gifts/GiftRevealModal";

export type GiftRevealSheetProps = GiftRevealModalProps;

export default function GiftRevealSheet(props: GiftRevealSheetProps) {
  return <GiftRevealModal {...props} />;
}
