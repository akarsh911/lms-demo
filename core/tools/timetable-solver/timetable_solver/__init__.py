"""Automatic timetable generation for Emerge, as a prototype.

The package is deliberately split so that only one module needs a solver:

    dto        frozen records, units documented
    school     export JSON -> dto
    preflight  arithmetic impossibilities, no solver
    verify     an independent audit of a week, no solver, no model
    render     printing
    solver     CP-SAT.  The only module that imports ortools.

Importing this package does not import ortools.  ``from timetable_solver import
solver`` does.
"""
