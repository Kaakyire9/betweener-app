import { AdminVerificationDashboard } from '@/components/AdminVerificationDashboard';
import { AdminScreenShell } from '@/components/admin/AdminScreenShell';

export default function AdminTrustScreen() {
  return (
    <AdminScreenShell
      title="Trust & Safety"
      subtitle="Verification, profile safety, and member reports."
      capability="trust"
      scroll={false}
    >
      <AdminVerificationDashboard scope="trust" />
    </AdminScreenShell>
  );
}
