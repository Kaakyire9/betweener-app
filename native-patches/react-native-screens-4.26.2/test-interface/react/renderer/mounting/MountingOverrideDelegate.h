#pragma once
#include "ShadowViewMutation.h"
namespace facebook::react {
struct MountingOverrideDelegate {
  virtual ~MountingOverrideDelegate() = default;
  virtual bool shouldOverridePullTransaction() const = 0;
  virtual std::optional<MountingTransaction> pullTransaction(
      SurfaceId, MountingTransaction::Number, const TransactionTelemetry &, ShadowViewMutationList) const = 0;
};
}
