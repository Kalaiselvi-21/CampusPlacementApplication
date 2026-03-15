import React, { useState } from "react";

// A tiny floating badge that expands on hover/click to show team credits
// Uses LinkedIn search links to avoid hardcoding personal profile URLs
const members = [
	{ name: "Aarthi" },
	{ name: "Balamurugan" },
	{ name: "Kanishka" },
	{ name: "Lakshmi Prabha" },
	{ name: "Sakthi" },
];

export default function CreditsBadge() {
	const [open, setOpen] = useState(false);

	return (
		<div
			style={{
				position: "fixed",
				bottom: 12,
				right: 12,
				zIndex: 9999,
				pointerEvents: "auto",
			}}
		>
			{/* Always-visible pill with LinkedIn icon hints */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					background: "rgba(0,0,0,0.65)",
					color: "#fff",
					borderRadius: 9999,
					padding: "6px 10px",
					fontSize: 12,
					backdropFilter: "blur(4px)",
					cursor: "pointer",
					boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
					userSelect: "none",
				}}
				onClick={() => setOpen((v) => !v)}
			>
				{/* Simple LinkedIn glyph */}
				<span
					aria-hidden
					style={{
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: 16,
						height: 16,
						borderRadius: 4,
						background: "#0A66C2",
						fontWeight: 700,
						fontSize: 10,
					}}
				>
					in
				</span>
				<span>Dev Team</span>
			</div>
			{open && (
				<div
					style={{
						position: "absolute",
						bottom: 40,
						right: 0,
						background: "rgba(0,0,0,0.85)",
						color: "#fff",
						borderRadius: 12,
						padding: 12,
						width: 260,
						boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<span
								aria-hidden
								style={{
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									width: 18,
									height: 18,
									borderRadius: 4,
									background: "#0A66C2",
									fontWeight: 700,
									fontSize: 11,
								}}
							>
								in
							</span>
							<div style={{ fontWeight: 600, opacity: 0.95 }}>Connect with the Developers</div>
						</div>
						<button onClick={() => setOpen(false)} style={{ background: "transparent", border: 0, color: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
					</div>
					<ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
						{members.map((m) => {
							const url = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(m.name)}%20software`;
							return (
								<li key={m.name} style={{ margin: "8px 0" }}>
									<a
										href={url}
										target="_blank"
										rel="noreferrer"
										style={{ display: "flex", alignItems: "center", gap: 8, color: "#cde3ff", textDecoration: "none" }}
									>
										<span aria-hidden style={{ width: 6, height: 6, borderRadius: 9999, background: "#8ad" }} />
										<span>{m.name}</span>
										<span style={{ marginLeft: "auto", opacity: 0.9, fontSize: 11 }}>Open LinkedIn ↗</span>
									</a>
								</li>
							);
						})}
					</ul>
				</div>
			)}
		</div>
	);
}


