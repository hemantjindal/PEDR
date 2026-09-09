'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { destroySession, requireUser } from '@/lib/auth'
import {
  createEmployment, createProject, deleteEntries, getEmployments, getProjects,
  updateEntry, updateProject, updateUser, upsertWeekNote,
} from '@/lib/data'
import type { CriterionId, ExperienceCategory, ExperienceLocation, StageId } from '@/lib/pedr/constants'
import { isDateKey, isWeekId } from '@/lib/pedr/week'

export async function signOutAction() {
  await destroySession()
  redirect('/sign-in')
}

export async function saveWeekNoteAction(formData: FormData) {
  const user = await requireUser()
  const weekId = String(formData.get('weekId') ?? '')
  if (!isWeekId(weekId)) throw new Error('Bad week')

  await upsertWeekNote(user.id, weekId, {
    did: String(formData.get('did') ?? ''),
    learned: String(formData.get('learned') ?? ''),
    wentWell: String(formData.get('wentWell') ?? ''),
    wentWrong: String(formData.get('wentWrong') ?? ''),
    next: String(formData.get('next') ?? ''),
  })

  revalidatePath(`/weeks/${weekId}`)
  revalidatePath('/dashboard')
  revalidatePath('/weeks')
}

export async function saveEntryAction(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get('entryId') ?? '')
  const date = String(formData.get('date') ?? '')
  if (!id || !isDateKey(date)) throw new Error('Bad entry')

  const stageRaw = String(formData.get('stage') ?? '')
  const stage = stageRaw === '' ? null : (Number(stageRaw) as StageId)
  const hours = Number(formData.get('hours') ?? 0)

  await updateEntry(user.id, id, {
    date,
    minutes: Number.isFinite(hours) ? Math.round(Math.max(0, Math.min(24, hours)) * 60) : 0,
    minutesEstimated: false,
    activity: String(formData.get('activity') ?? '').slice(0, 2000),
    detail: (String(formData.get('detail') ?? '').trim() || null),
    projectId: (String(formData.get('projectId') ?? '') || null),
    stage: stage !== null && stage >= 0 && stage <= 7 ? stage : null,
    officeCategory: (String(formData.get('officeCategory') ?? '') || null) as never,
    people: String(formData.get('people') ?? '')
      .split(',').map((p) => p.trim()).filter(Boolean).slice(0, 30),
    criteria: formData.getAll('criteria').map(String).slice(0, 3) as CriterionId[],
    wentWrong: (String(formData.get('wentWrong') ?? '').trim() || null),
    learned: (String(formData.get('learned') ?? '').trim() || null),
    verified: true,
  })

  revalidatePath('/review')
  revalidatePath('/dashboard')
  revalidatePath(`/weeks`)
}

export async function deleteEntryAction(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get('entryId') ?? '')
  if (!id) return
  await deleteEntries(user.id, [id])
  revalidatePath('/review')
  revalidatePath('/dashboard')
  revalidatePath('/weeks')
}

export async function saveProjectAction(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get('projectId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return

  const patch = {
    code: String(formData.get('code') ?? '').trim(),
    name,
    client: String(formData.get('client') ?? '').trim() || null,
    sector: String(formData.get('sector') ?? '').trim() || null,
    procurement: String(formData.get('procurement') ?? '').trim() || null,
    contractForm: String(formData.get('contractForm') ?? '').trim() || null,
    isCaseStudy: formData.get('isCaseStudy') === 'on',
    aliases: String(formData.get('aliases') ?? '')
      .split(',').map((a) => a.trim()).filter(Boolean).slice(0, 20),
    valueGbp: Number(formData.get('valueGbp')) || null,
  }

  if (id) await updateProject(user.id, id, patch)
  else await createProject(user.id, patch)

  revalidatePath('/projects')
  revalidatePath('/settings')
}

export async function archiveProjectAction(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get('projectId') ?? '')
  if (!id) return
  await updateProject(user.id, id, { archived: formData.get('archived') === 'true' })
  revalidatePath('/projects')
}

export async function saveEmploymentAction(formData: FormData) {
  const user = await requireUser()
  const employer = String(formData.get('employer') ?? '').trim()
  const startDate = String(formData.get('startDate') ?? '')
  if (!employer || !isDateKey(startDate)) return

  await createEmployment(user.id, {
    employer,
    startDate,
    endDate: isDateKey(String(formData.get('endDate') ?? '')) ? String(formData.get('endDate')) : null,
    role: String(formData.get('role') ?? '').trim() || null,
    officeLocation: String(formData.get('officeLocation') ?? '').trim() || null,
    location: (String(formData.get('location') ?? 'UK') as ExperienceLocation),
    category: (String(formData.get('category') ?? 'i') as ExperienceCategory),
    supervisorName: String(formData.get('supervisorName') ?? '').trim() || null,
    supervisorRegBody: String(formData.get('supervisorRegBody') ?? 'ARB').trim() || null,
    supervisorRegNumber: String(formData.get('supervisorRegNumber') ?? '').trim() || null,
    mentorName: String(formData.get('mentorName') ?? '').trim() || null,
    mentorEmail: String(formData.get('mentorEmail') ?? '').trim() || null,
    weeklyHours: Number(formData.get('weeklyHours')) || 37.5,
  })

  // A first employment sets where the record starts, if nothing else has.
  if (!user.experienceStart) {
    await updateUser(user.id, { experienceStart: startDate })
  }

  revalidatePath('/settings')
  revalidatePath('/dashboard')
}

export async function saveSettingsAction(formData: FormData) {
  const user = await requireUser()
  const experienceStart = String(formData.get('experienceStart') ?? '')
  const targetExamDate = String(formData.get('targetExamDate') ?? '')

  await updateUser(user.id, {
    name: String(formData.get('name') ?? '').trim() || undefined,
    teamsName: String(formData.get('teamsName') ?? '').trim() || null,
    experienceStart: isDateKey(experienceStart) ? experienceStart : null,
    targetExamDate: isDateKey(targetExamDate) ? targetExamDate : null,
  })

  revalidatePath('/settings')
  revalidatePath('/dashboard')
}

/**
 * Everything the record cannot work without, saved in one go.
 *
 * A first-run flow that saves nothing until the end would lose somebody's
 * twenty minutes to a closed tab, and one that saves per step leaves half-set
 * records around. This takes the whole thing at once and is idempotent: run it
 * twice and you get one employment, not two.
 */
export async function completeOnboardingAction(formData: FormData) {
  const user = await requireUser()

  const experienceStart = String(formData.get('experienceStart') ?? '')
  const targetExamDate = String(formData.get('targetExamDate') ?? '')
  const employer = String(formData.get('employer') ?? '').trim()

  await updateUser(user.id, {
    name: String(formData.get('name') ?? '').trim() || undefined,
    experienceStart: isDateKey(experienceStart) ? experienceStart : null,
    targetExamDate: isDateKey(targetExamDate) ? targetExamDate : null,
    part2School: String(formData.get('part2School') ?? '').trim() || null,
    practiceSize: String(formData.get('practiceSize') ?? '').trim() || null,
    onboardedAt: new Date().toISOString(),
  })

  if (employer && isDateKey(experienceStart)) {
    const existing = await getEmployments(user.id)
    if (existing.length === 0) {
      await createEmployment(user.id, {
        employer,
        startDate: experienceStart,
        endDate: null,
        role: String(formData.get('role') ?? '').trim() || null,
        officeLocation: String(formData.get('officeLocation') ?? '').trim() || null,
        location: (String(formData.get('location') ?? 'UK') as ExperienceLocation),
        category: (String(formData.get('category') ?? 'i') as ExperienceCategory),
        supervisorName: String(formData.get('supervisorName') ?? '').trim() || null,
        supervisorRegBody: String(formData.get('supervisorRegBody') ?? 'ARB').trim() || null,
        supervisorRegNumber: String(formData.get('supervisorRegNumber') ?? '').trim() || null,
        mentorName: String(formData.get('mentorName') ?? '').trim() || null,
        mentorEmail: String(formData.get('mentorEmail') ?? '').trim() || null,
        weeklyHours: Number(formData.get('weeklyHours')) || 37.5,
      })
    }
  }

  // Projects arrive as repeated fields, so a blank row is simply skipped.
  const codes = formData.getAll('projectCode').map((v) => String(v).trim())
  const names = formData.getAll('projectName').map((v) => String(v).trim())
  const existingProjects = await getProjects(user.id)
  const known = new Set(existingProjects.map((p) => `${p.code}|${p.name}`.toLowerCase()))

  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    const code = codes[i] ?? ''
    if (!name && !code) continue
    const key = `${code}|${name || code}`.toLowerCase()
    if (known.has(key)) continue
    known.add(key)
    await createProject(user.id, {
      code,
      name: name || code,
      client: null,
      sector: null,
      valueGbp: null,
      procurement: null,
      contractForm: null,
      isCaseStudy: false,
      notes: null,
      aliases: [],
    })
  }

  revalidatePath('/dashboard')
  revalidatePath('/settings')
  redirect('/dashboard')
}

/** Leave setup for later without being asked again on every page load. */
export async function skipOnboardingAction() {
  const user = await requireUser()
  await updateUser(user.id, { onboardedAt: new Date().toISOString() })
  redirect('/dashboard')
}
