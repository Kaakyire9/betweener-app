import sys
import zmq


def main():
    if len(sys.argv) != 3:
        raise SystemExit(2)
    port = int(sys.argv[1])
    volume = float(sys.argv[2])
    if port < 1024 or port > 65535 or volume < 0 or volume > 0.5:
        raise SystemExit(2)
    context = zmq.Context()
    socket = context.socket(zmq.REQ)
    socket.setsockopt(zmq.LINGER, 0)
    socket.setsockopt(zmq.RCVTIMEO, 2000)
    socket.setsockopt(zmq.SNDTIMEO, 2000)
    try:
        socket.connect(f"tcp://127.0.0.1:{port}")
        socket.send_string(f"volume@programme volume {volume:.3f}")
        response = socket.recv_string()
        if not response.startswith("0 "):
            raise RuntimeError("gain_command_rejected")
    finally:
        socket.close()
        context.term()


if __name__ == "__main__":
    main()
