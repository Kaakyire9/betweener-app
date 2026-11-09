import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.*
import kotlin.system.exitProcess

private data class Endpoint(val id: String, val type: String)
private object Call {
    data class Registered(
        val currentCallEndpoint: Endpoint? = null,
        val availableCallEndpoints: List<Endpoint> = emptyList(),
        val isPending: Boolean = false,
        val isMuted: Boolean = false,
    ) { fun isIncoming() = true }
    object None
}
private typealias CallState = Call.Registered

private const val TAG = "synthetic-endpoint-observer"
private fun debugLog(@Suppress("UNUSED_PARAMETER") tag: String, @Suppress("UNUSED_PARAMETER") message: String) {}

private interface Listener {
    fun onCallRegistered(callId: String, incoming: Boolean) {}
    fun onMuteCallChanged(callId: String, isMuted: Boolean) {}
    fun onCallAudioEndpointsChanged(callId: String) {}
    fun onCallStateChanged(callId: String, call: Any) {}
}

private class SnapshotObserver(owner: CoroutineScope, val calls: MutableStateFlow<Map<String, CallState>>) {
    private val job = SupervisorJob(owner.coroutineContext[Job])
    private val scope = CoroutineScope(owner.coroutineContext + job)
    val snapshots = mutableMapOf<String, CallState>()
    private val _listener: Listener? = object : Listener {
        override fun onCallAudioEndpointsChanged(callId: String) {
            calls.value[callId]?.let { snapshots[callId] = it }
        }
        override fun onCallStateChanged(callId: String, call: Any) {
            if (call === Call.None) snapshots.remove(callId)
        }
    }

    /* REPOSITORY_CALL_OBSERVER */

    fun start() { observeCalls() }
    fun dispose() { job.cancel() }
}

// The runner inserts the installed repository's actual launch/collect block here.
// No Android, React Native, provider, media, credentials or hardware is involved.
private fun CoroutineScope.observeRepositoryEndpoints(
    callId: String,
    currentCallEndpoint: Flow<Endpoint>,
    availableEndpoints: Flow<List<Endpoint>>,
    preCallEndpointsJob: Job?,
    updateCallById: (String, CallState.() -> CallState) -> Unit,
) {
    /* REPOSITORY_ENDPOINT_COLLECTORS */
}

private class Session(
    owner: CoroutineScope,
    val callId: String = "synthetic-call-a",
    val calls: MutableStateFlow<Map<String, CallState>> = MutableStateFlow(emptyMap()),
) {
    private val sessionJob = SupervisorJob(owner.coroutineContext[Job])
    private val session = CoroutineScope(owner.coroutineContext + sessionJob)
    private val endpointChannel = Channel<List<Endpoint>>(Channel.UNLIMITED)
    private val currentChannel = Channel<Endpoint>(Channel.UNLIMITED)
    val preCallJob = Job()
    val releaseSnapshots = mutableListOf<List<Endpoint>>()
    var collectors = 0
        private set

    init {
        calls.update { it + (callId to CallState()) }
        preCallJob.invokeOnCompletion {
            releaseSnapshots += calls.value[callId]?.availableCallEndpoints.orEmpty()
        }
        session.observeRepositoryEndpoints(
            callId, currentChannel.receiveAsFlow(), flow {
                collectors++
                try { emitAll(endpointChannel.receiveAsFlow()) } finally { collectors-- }
            }, preCallJob,
        ) { id, transform ->
            // Same conditional, atomic per-call update contract as CallRepository.
            calls.update { states ->
                val existing = states[id]
                if (existing == null) states else states + (id to transform(existing))
            }
        }
    }

    val state: CallState get() = checkNotNull(calls.value[callId])
    suspend fun devices(value: List<Endpoint>) { endpointChannel.send(value); settle() }
    suspend fun current(value: Endpoint) { currentChannel.send(value); settle() }
    fun retire() { sessionJob.cancel() }
    fun dispose() { sessionJob.cancel(); preCallJob.cancel(); endpointChannel.cancel(); currentChannel.cancel() }
}

private suspend fun settle() { repeat(8) { yield() } }
private val ear = Endpoint("session-ear", "earpiece")
private val speaker = Endpoint("session-speaker", "speaker")
private val bluetooth = Endpoint("session-bt", "bluetooth")
private val wired = Endpoint("session-wired", "wired-headset")

fun main() = runBlocking {
    var passed = 0
    val failed = mutableListOf<String>()
    suspend fun scenario(name: String, body: suspend CoroutineScope.() -> Unit) {
        try {
            withTimeout(5_000) { coroutineScope { body() } }
            println("PASS $name")
            passed++
        } catch (error: Throwable) {
            println("FAIL $name: ${error.message}")
            failed += name
        }
    }

    scenario("single_consumer") {
        val call = Session(this)
        try {
            settle()
            check(call.collectors == 1) { "endpoint stream has ${call.collectors} consumers" }
        } finally { call.dispose() }
    }
    scenario("empty_keeps_setup_alive") {
        val call = Session(this)
        try {
            call.devices(emptyList())
            check(call.state.availableCallEndpoints.isEmpty())
            check(call.preCallJob.isActive)
        } finally { call.dispose() }
    }
    scenario("current_is_not_device_availability") {
        val call = Session(this)
        try {
            call.current(speaker)
            check(call.state.currentCallEndpoint == speaker)
            check(call.state.availableCallEndpoints.isEmpty())
            check(call.preCallJob.isActive)
        } finally { call.dispose() }
    }
    scenario("empty_then_ready") {
        val call = Session(this)
        try {
            call.devices(emptyList())
            call.current(speaker)
            call.devices(listOf(ear, speaker))
            check(call.state.availableCallEndpoints == listOf(ear, speaker)) { "first ready list was lost" }
            check(call.state.currentCallEndpoint == speaker)
            check(!call.preCallJob.isActive)
            check(call.releaseSnapshots == listOf(listOf(ear, speaker))) { "setup released before publication" }
        } finally { call.dispose() }
    }
    scenario("ready_releases_pre_call") {
        val call = Session(this)
        try {
            call.devices(listOf(ear, speaker))
            check(call.state.availableCallEndpoints == listOf(ear, speaker))
            check(!call.preCallJob.isActive) { "setup subscription leaked after first ready list" }
            check(call.releaseSnapshots == listOf(listOf(ear, speaker)))
        } finally { call.dispose() }
    }
    scenario("endpoint_changes") {
        val call = Session(this)
        try {
            call.devices(listOf(ear, speaker))
            // Synthetic endpoint changes exercise stream delivery, not real accessories.
            for (devices in listOf(listOf(speaker, bluetooth), listOf(speaker, wired), emptyList(), listOf(ear, speaker))) {
                call.devices(devices)
                check(call.state.availableCallEndpoints == devices) { "endpoint change was lost" }
            }
            check(call.releaseSnapshots.size == 1)
        } finally { call.dispose() }
    }
    scenario("canonical_isolation") {
        val calls = MutableStateFlow<Map<String, CallState>>(emptyMap())
        val a = Session(this, "synthetic-call-a", calls)
        val b = Session(this, "synthetic-call-b", calls)
        val bEar = Endpoint("other-session-ear", "earpiece")
        try {
            a.devices(emptyList()); b.devices(emptyList())
            a.devices(listOf(ear, speaker)); b.devices(listOf(bEar))
            a.current(speaker); b.current(bEar)
            check(a.state.availableCallEndpoints == listOf(ear, speaker)) { "call A lost its list" }
            check(b.state.availableCallEndpoints == listOf(bEar)) { "call B lost its list" }
            check(a.state.currentCallEndpoint == speaker && b.state.currentCallEndpoint == bEar)
        } finally { a.dispose(); b.dispose() }
    }
    scenario("retired_session_cannot_change_next_call") {
        val calls = MutableStateFlow<Map<String, CallState>>(emptyMap())
        val old = Session(this, "synthetic-call-a", calls)
        old.current(ear)
        old.retire(); settle()
        val next = Session(this, "synthetic-call-a", calls)
        try {
            next.devices(listOf(speaker)); next.current(speaker)
            old.devices(listOf(bluetooth)); old.current(bluetooth)
            check(next.state.availableCallEndpoints == listOf(speaker))
            check(next.state.currentCallEndpoint == speaker)
            check(old.collectors == 0)
        } finally { old.dispose(); next.dispose() }
    }
    scenario("removed_call_is_not_resurrected") {
        val call = Session(this)
        try {
            call.calls.update { it - call.callId }
            call.devices(listOf(ear, speaker)); call.current(ear)
            check(call.callId !in call.calls.value)
        } finally { call.dispose() }
    }
    scenario("first_registered_snapshot_is_seeded") {
        val calls = MutableStateFlow<Map<String, CallState>>(emptyMap())
        val observer = SnapshotObserver(this, calls)
        try {
            observer.start(); settle()
            // Model registration + endpoints coalescing before StateFlow resumes its observer.
            calls.value = mapOf("synthetic-call-a" to CallState(isPending = true))
            calls.value = mapOf("synthetic-call-a" to CallState(ear, listOf(ear, speaker)))
            settle()
            check(observer.snapshots["synthetic-call-a"] == calls.value["synthetic-call-a"]) {
                "initial per-call audio snapshot was never published"
            }
        } finally { observer.dispose() }
    }
    scenario("snapshot_updates_and_removal_still_work") {
        val calls = MutableStateFlow(mapOf("synthetic-call-a" to CallState()))
        val observer = SnapshotObserver(this, calls)
        try {
            observer.start(); settle()
            calls.value = mapOf("synthetic-call-a" to CallState(speaker, listOf(ear, speaker)))
            settle()
            check(observer.snapshots["synthetic-call-a"]?.currentCallEndpoint == speaker)
            calls.value = emptyMap(); settle()
            check(observer.snapshots.isEmpty())
        } finally { observer.dispose() }
    }
    println("RESULT passed=$passed failed=${failed.size}")
    if (failed.isNotEmpty()) exitProcess(1)
}
