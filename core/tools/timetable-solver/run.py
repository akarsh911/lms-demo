"""Solve a week for an exported school and audit the answer independently.

    python run.py school.json
    python run.py school.json --demand-from-current
    python run.py school.json --set ENG=8            # over-constrain it

Every number printed here comes either from the solver or from
``timetable_solver.verify``, which re-reads the export and never sees the model.
"""

import argparse
import json
import sys

from timetable_solver import preflight, render, school as school_mod, verify
from timetable_solver.dto import SolveConfig


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", help="path to the JSON written by export.sh")
    parser.add_argument("--demand-from-current", action="store_true",
                        help="take periods_per_week from the published week, "
                             "because the column is NULL in the demo tenant")
    parser.add_argument("--set", action="append", default=[], metavar="CODE=N",
                        help="override demand for every offering of a subject")
    parser.add_argument("--minutes", action="append", default=[], metavar="CODE=N",
                        help="state a weekly minutes obligation for a subject")
    parser.add_argument("--pin", action="append", default=[], metavar="CODE[@SEC]:DAY=N",
                        help="require N periods of a subject on an ISO weekday, "
                             "e.g. SST@2026-2027-G6-A:2=7 or FRE:6=1")
    parser.add_argument("--room-type", action="append", default=[], metavar="CODE=TYPE",
                        help="require a room type for a subject, e.g. SCI=laboratory")
    parser.add_argument("--unavailable", action="append", default=[], metavar="NAME=DAYS",
                        help="block a teacher, e.g. 'Myra Rao=1,2,3,4,6'")
    parser.add_argument("--heavy", default="MATH,SCI",
                        help="subject codes that should avoid the last period")
    parser.add_argument("--seconds", type=float, default=60.0)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--minutes-basis", default="nominal",
                        choices=["nominal", "realised"])
    parser.add_argument("--hint-current", action="store_true",
                        help="seed the search with the published week; CP-SAT is "
                             "stateless between solves, so this is the only way a "
                             "re-solve benefits from the last one")
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--json-out", default=None)
    return parser.parse_args(argv)


def pairs(items):
    out = {}
    for item in items:
        key, _, value = item.partition("=")
        out[key.strip()] = value.strip()
    return out


def main(argv):
    args = parse_args(argv)

    base = school_mod.load(args.export)
    demand = {}
    if args.demand_from_current:
        demand.update(school_mod.demand_from_current(args.export))
    for code, value in pairs(args.set).items():
        for offering in base.offerings:
            if offering.subject_code == code:
                demand[offering.id] = int(value)

    minutes = pairs(args.minutes)
    room_types = pairs(args.room_type)
    heavy = tuple(c for c in args.heavy.split(",") if c)

    loaded = school_mod.load(
        args.export, demand=demand, required_room_type=room_types,
        heavy_subjects=heavy)

    if minutes:
        from dataclasses import replace
        loaded = replace(loaded, offerings=tuple(
            replace(o, minutes_per_week=int(minutes[o.subject_code]))
            if o.subject_code in minutes else o
            for o in loaded.offerings))

    blocked = {}
    for name, days in pairs(args.unavailable).items():
        wanted = {int(d) for d in days.split(",") if d.strip()}
        for teacher in loaded.teachers:
            if teacher.name == name or teacher.id == name:
                blocked[teacher.id] = frozenset(
                    key for key in preflight.grid(loaded) if key[0] in wanted)

    pins = {}
    for spec, count in pairs(args.pin).items():
        target, _, day = spec.partition(":")
        code, _, section_code = target.partition("@")
        for offering in loaded.offerings:
            if offering.subject_code != code:
                continue
            section = loaded.section(offering.section_id)
            if section_code and (section is None or section.code != section_code):
                continue
            pins.setdefault(offering.id, {})[int(day)] = int(count)

    config = SolveConfig(
        max_seconds=args.seconds,
        pins=pins,
        num_workers=args.workers,
        unavailable=blocked,
        required_room_type=room_types,
        heavy_subjects=frozenset(heavy),
        minutes_basis=args.minutes_basis,
    )

    print("%s - %s to %s, %d weeks" % (
        loaded.branch_name, loaded.window_lo, loaded.window_hi, loaded.weeks))
    print("%d sections, %d offerings, %d teachers, %d rooms, %d cohorts, %d cells"
          % (len(loaded.sections), len(loaded.offerings), len(loaded.teachers),
             len(loaded.rooms), len(loaded.cohorts), len(loaded.cells)))
    wanted = preflight.demand_of(loaded, config)
    print("demand: %d periods across %d offerings"
          % (sum(wanted.values()), len(wanted)))

    from timetable_solver import solver as solver_mod

    hint = ()
    if args.hint_current:
        from timetable_solver.dto import Placement
        with open(args.export) as handle:
            hint = tuple(
                Placement(
                    offering_id=row["offering_id"],
                    section_id=row["section_id"],
                    day_of_week=int(row["day_of_week"]),
                    period_id=row["period_id"],
                    teacher_id=row.get("teacher_id"),
                    room_id=row.get("room_id"),
                )
                for row in json.load(handle).get("current_slots", [])
            )

    result = solver_mod.solve(loaded, config, hint=hint)
    print("")
    print("status  : %s" % result.status)
    print("verdict : %s" % result.verdict)
    print("wall    : %.2fs" % result.wall_time_s)
    if result.objective is not None:
        print("objective: %.0f" % result.objective)

    if result.core_explanation:
        print("")
        print("core keys: %s" % ", ".join(result.infeasibility_core))
        print("")
        print(result.core_explanation)
        return 1

    if not args.quiet:
        print(render.section_view(loaded, result.placements))
        print("")
        print(render.teacher_view(loaded, result.placements))
        print(render.load_table(loaded, result.placements))

    if result.soft_violations:
        print("")
        print("soft violations (%d):" % len(result.soft_violations))
        for violation in result.soft_violations:
            print("  - %s" % violation.message)

    wire = [
        {
            "offering_id": p.offering_id,
            "section_id": p.section_id,
            "day_of_week": p.day_of_week,
            "period_id": p.period_id,
            "teacher_id": p.teacher_id,
            "room_id": p.room_id,
        }
        for p in result.placements
    ]
    if args.json_out:
        with open(args.json_out, "w") as handle:
            json.dump(wire, handle, indent=2)

    print("")
    report = verify.verify(args.export, wire, demand=wanted)
    print(verify.summarise(report))
    return 0 if report.clean else 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
