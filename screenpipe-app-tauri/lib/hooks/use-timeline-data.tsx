import { StreamTimeSeriesResponse } from "@/components/rewind/timeline";
import { useTimelineStore } from "./use-timeline-store";
import { useEffect, useRef } from "react";

export function useTimelineData(
	currentDate: Date,
	setCurFrame: (frame: StreamTimeSeriesResponse) => void,
	port?: number,
) {
	const {
		frames,
		isLoading,
		error,
		message,
		connectWebSocket,
		fetchNextDayData,
		websocket,
		setPort,
	} = useTimelineStore();

	// Track if we've already set the initial frame
	const hasSetInitialFrame = useRef(false);

	useEffect(() => {
		if (port !== undefined) {
			setPort(port);
		}
	}, [port, setPort]);

	useEffect(() => {
		// Establish WebSocket connection on mount
		// The connectWebSocket function handles closing existing connections
		connectWebSocket();
	}, []); // Only connect once when component mounts

	// Set initial frame when frames first arrive (only once per session)
	useEffect(() => {
		if (frames.length > 0 && !hasSetInitialFrame.current) {
			setCurFrame(frames[0]);
			hasSetInitialFrame.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [frames.length > 0]); // Boolean - only run when transitioning from no frames to having frames

	return {
		frames,
		isLoading,
		error,
		message,
		fetchNextDayData,
		websocket, // Expose websocket so timeline.tsx can depend on it
	};
}

