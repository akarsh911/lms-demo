import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { gradesService } from '@/services/grades';
import type { ClassmateList, ExamDetail, ExamFilter, ExamSummary, MarkDetail, QuestionPaper, StudentGrades, StudentOption } from '@/types/grades';

export function useExams(sessionId?: string) {
  return useQuery<ExamSummary[], ApiError>({
    queryKey: queryKeys.grades.exams(sessionId ?? ''),
    queryFn: () => gradesService.listExams(sessionId),
  });
}

// A filter change keeps the last table on screen, dimmed, rather than tearing it down to skeletons.
export function useExam(examId: string, filter: ExamFilter) {
  return useQuery<ExamDetail, ApiError>({
    queryKey: queryKeys.grades.exam(examId, JSON.stringify(filter)),
    queryFn: () => gradesService.getExam(examId, filter),
    placeholderData: keepPreviousData,
  });
}

export function useStudentGrades(studentId: string, sessionId?: string) {
  return useQuery<StudentGrades, ApiError>({
    queryKey: queryKeys.grades.student(studentId, sessionId ?? ''),
    queryFn: () => gradesService.getStudent(studentId, sessionId),
    placeholderData: keepPreviousData,
  });
}

export function useMark(markId: string | null) {
  return useQuery<MarkDetail, ApiError>({
    queryKey: queryKeys.grades.mark(markId ?? ''),
    queryFn: () => gradesService.getMark(markId ?? ''),
    enabled: Boolean(markId),
  });
}

export function useQuestionPaper(examSubjectId: string | null) {
  return useQuery<QuestionPaper, ApiError>({
    queryKey: queryKeys.grades.paper(examSubjectId ?? ''),
    queryFn: () => gradesService.getQuestionPaper(examSubjectId ?? ''),
    enabled: Boolean(examSubjectId),
  });
}

export function useStudentSearch(query: string) {
  return useQuery<StudentOption[], ApiError>({
    queryKey: queryKeys.grades.students(query),
    queryFn: () => gradesService.searchStudents(query),
    placeholderData: keepPreviousData,
  });
}

// The previous roster holds while the next loads, so moving between pupils never blanks the list.
export function useClassmates(studentId: string, sessionId: string | undefined, scope: 'section' | 'class', gradeId?: string, sectionId?: string) {
  return useQuery<ClassmateList, ApiError>({
    queryKey: queryKeys.grades.classmates(studentId, sessionId ?? '', scope, gradeId ?? '', sectionId ?? ''),
    queryFn: () => gradesService.getClassmates(studentId, sessionId, scope, gradeId, sectionId),
    placeholderData: keepPreviousData,
  });
}
