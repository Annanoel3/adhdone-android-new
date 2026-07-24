import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTaskSort, SORT_OPTIONS } from "@/hooks/useTaskSort";

export default function TaskSortDropdown({ className = "" }) {
  const { sortBy, setSortBy } = useTaskSort();

  return (
    <Select value={sortBy} onValueChange={setSortBy}>
      <SelectTrigger className={`w-36 ${className}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(SORT_OPTIONS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}