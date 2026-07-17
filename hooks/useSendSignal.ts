import { sendSignal, type SendSignalInput } from "@/lib/signal/signal-api";
import { useCallback, useState } from "react";

export default function useSendSignal() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (input: SendSignalInput) => {
    setSubmitting(true);
    try {
      return await sendSignal(input);
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submit, submitting };
}
