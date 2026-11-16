#include "RNSScreenRemovalListener.h"
#include <atomic>
#include <cstdio>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <thread>
#include <vector>

using namespace facebook::react;

static void check(bool condition, const char *message) {
  if (!condition) throw std::runtime_error(message);
}

static ShadowViewMutationList removals() {
  return {{ShadowViewMutation::Type::Remove, {"RNSScreen", 42}},
          {ShadowViewMutation::Type::Remove, {"OtherView", 43}},
          {ShadowViewMutation::Type::Create, {"RNSScreen", 44}}};
}

int main() {
  try {
    RNSScreenRemovalListener listener;
    auto untouched = listener.pullTransaction(7, 19, {123}, removals());
    check(untouched && untouched->surface == 7 && untouched->number == 19 &&
          untouched->telemetry.marker == 123 && untouched->mutations.size() == 3 &&
          untouched->mutations[0].oldChildShadowView.tag == 42, "Disarmed transaction changed");

    std::vector<int> tags;
    const auto first = listener.setListener([&](int tag) { tags.push_back(tag); });
    listener.pullTransaction(7, 20, {123}, removals());
    check(tags == std::vector<int>{42}, "Removal callback filtering changed");
    int currentCalls = 0;
    const auto current = listener.setListener([&](int) { ++currentCalls; });
    check(current > first, "Ownership tokens must increase");
    listener.clearListener(first);
    listener.pullTransaction(7, 21, {123}, removals());
    check(currentCalls == 1, "Stale teardown disarmed the newer owner");
    listener.clearListener(current);
    listener.pullTransaction(7, 22, {123}, removals());
    check(currentCalls == 1, "Current teardown retained the callback");

    uint64_t reentrant = 0;
    reentrant = listener.setListener([&](int) { listener.clearListener(reentrant); });
    // A bounded test runner catches deadlock if invocation still holds the mutex.
    listener.pullTransaction(7, 23, {123}, removals());

    auto captured = std::make_shared<int>(1);
    std::weak_ptr<int> weak = captured;
    const auto capturedToken = listener.setListener([captured](int) {});
    captured.reset();
    check(!weak.expired(), "Installed callback lost its captured owner");
    listener.clearListener(capturedToken);
    check(weak.expired(), "Teardown leaked its captured owner");

    std::atomic<int> calls{0};
    std::vector<std::thread> workers;
    for (int thread = 0; thread < 6; ++thread) {
      workers.emplace_back([&] {
        for (int index = 0; index < 5000; ++index) {
          const auto token = listener.setListener([&](int) { calls.fetch_add(1); });
          auto result = listener.pullTransaction(7, index, {123}, removals());
          check(result && result->mutations.size() == 3, "Concurrent transaction changed");
          listener.clearListener(token);
        }
      });
    }
    for (auto &worker : workers) worker.join();
    listener.clearListener(listener.setListener([](int) {}));
    std::puts("PASS: pass-through, filtering, stale-owner teardown, current teardown, reentrant clear, captured lifetime, 30000 concurrent transactions");
    return 0;
  } catch (const std::exception &error) {
    std::fprintf(stderr, "FAIL: %s\n", error.what());
    return 1;
  }
}
