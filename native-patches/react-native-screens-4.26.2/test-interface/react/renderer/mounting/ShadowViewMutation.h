#pragma once
#include <cstring>
#include <optional>
#include <utility>
#include <vector>

// Small unit-test models only. These do not validate React Native ABI or JNI.
namespace facebook::react {
using SurfaceId = int;
struct ShadowView {
  const char *componentName;
  int tag;
};
struct ShadowViewMutation {
  enum class Type { Create, Remove, Update };
  Type type;
  ShadowView oldChildShadowView;
};
using ShadowViewMutationList = std::vector<ShadowViewMutation>;
struct TransactionTelemetry { int marker; };
class MountingTransaction {
 public:
  using Number = long long;
  SurfaceId surface;
  Number number;
  ShadowViewMutationList mutations;
  TransactionTelemetry telemetry;
  MountingTransaction(SurfaceId surface, Number number,
                      ShadowViewMutationList mutations, TransactionTelemetry telemetry)
      : surface(surface), number(number), mutations(std::move(mutations)), telemetry(telemetry) {}
};
}
