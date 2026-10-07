import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTaskSort, SORT_OPTIONS } from "@/hooks/useTaskSort";

// extra: more choices for this one list ({ value: label }), e.g. "Recently
// Completed" while the Tasks page shows finished tasks. A saved choice that
// this list doesn't offer shows as the default.
export default function TaskSortDropdown({ className = "", extra = null }) {
  const { sortBy, setSortBy } = useTaskSort();
  const options = extra ? { ...SORT_OPTIONS, ...extra } : SORT_OPTIONS;
  const shown = options[sortBy] ? sortBy : "created_date";

  return (
    <Select value={shown} onValueChange={setSortBy}>
      <SelectTrigger className={`w-36 ${className}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(options).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}