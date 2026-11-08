import { AdminVerificationDashboard } from '@/components/AdminVerificationDashboard';
import { AdminScreenShell } from '@/components/admin/AdminScreenShell';

export default function AdminAccountsScreen() {
  return (
    <AdminScreenShell
      title="Members & Accounts"
      subtitle="Concierge, account recovery, and controlled merge cases."
      capability="accounts"
      scroll={false}
    >
      <AdminVerificationDashboard scope="accounts" />
    </AdminScreenShell>
  );
}
