import { isSameDay } from "date-fns";
import { getRawSqlUrl } from "../utils/api-url";

export async function hasFramesForDate(date: Date, port?: number) {
	try {
		// Set up start and end of the day
		const startOfDay = new Date(date);
		startOfDay.setHours(0, 0, 0, 0);

		let endOfDay = new Date(date);
		if (isSameDay(startOfDay, new Date())) {
			endOfDay.setMinutes(endOfDay.getMinutes() - 5);
		} else {
			endOfDay.setHours(23, 59, 59, 999);
		}

		const query = `
            SELECT COUNT(*) as frame_count
            FROM frames f
            WHERE f.timestamp >= '${startOfDay.toISOString()}'
            AND f.timestamp <= '${endOfDay.toISOString()}'
            LIMIT 1
        `;

		const response = await fetch(getRawSqlUrl(port), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query }),
		});

		if (!response.ok) {
			return {
				error: "Error occurred while checking frames",
				details: await response.json(),
			};
		}

		const result = await response.json();
		console.log("result", result);
		return result[0]?.frame_count > 0;
	} catch (e) {
		return {
			error: "Error occurred while checking frames",
			details: e,
		};
	}
}
