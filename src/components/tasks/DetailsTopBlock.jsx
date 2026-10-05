import React from "react";
import RecordNotesButton from "./RecordNotesButton";

// Top of the task details popup: the full "Record notes" button (events worth
// notes only) and the description.
export default function DetailsTopBlock({ task, theme }) {
  const dark = theme === "dark";
  return (
    <>
      <div className="flex empty:hidden"><RecordNotesButton task={task} theme={theme} /></div>
      {task.description && (
        <div>
          <h4 className={`text-sm font-medium mb-2 ${dark ? "text-gray-400" : "text-gray-500"}`}>Description</h4>
          <p className={dark ? "text-gray-300" : "text-gray-700"}>{task.description}</p>
        </div>
      )}
    </>
  );
}