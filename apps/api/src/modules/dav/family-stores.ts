import { Injectable } from "@nestjs/common";
import { MEAL_SLOTS, type FamilyNote, type MenuMeal, type Occasion, type Recipe, type Routine, type ScheduleEntry } from "@familywall/shared";
import { MembersRepository } from "../members/members.repository";
import { SettingsRepository } from "../settings/settings.repository";
import { DavStore, type CollectionSpec } from "./dav-store";
import {
  menuMapper,
  noteMapper,
  occasionMapper,
  recipeMapper,
  routineMapper,
  setRoutineStep,
  scheduleMapper,
  setChoreDone,
  type MenuMealFields,
  type NoteFields,
  type OccasionFields,
  type RecipeFields,
  type ReadContext,
  type RoutineFields,
  type RoutineWriteFields,
  type ScheduleFields,
  type ScheduleWriteFields
} from "./family-ics";
import { FamilyObjects } from "./family-objects";

/** Collections of the family on the built-in CalDAV server; phones show them by display name. */
export const FAMILY_COLLECTIONS = {
  occasions: { name: "familywall-compleanni", displayName: "Compleanni", color: "#DB2777", component: "VEVENT" },
  menu: { name: "familywall-menu", displayName: "Menu", color: "#EA580C", component: "VEVENT" },
  schedule: { name: "familywall-turni", displayName: "Turni", color: "#0EA5E9", component: "VEVENT" },
  notes: { name: "familywall-note", displayName: "Note", color: "#EAB308", component: "VJOURNAL" },
  routines: { name: "familywall-routine", displayName: "Routine", color: "#8B5CF6", component: "VEVENT" },
  recipes: { name: "familywall-ricette", displayName: "Ricette", color: "#16A34A", component: "VJOURNAL" }
} satisfies Record<string, CollectionSpec>;

const readContext = (settings: SettingsRepository) => (): ReadContext => ({ timezone: settings.get().timezone, now: new Date() });

/** Birthdays and anniversaries (yearly events in "Compleanni"). */
@Injectable()
export class OccasionsStore extends FamilyObjects<Occasion, OccasionFields> {
  public constructor(store: DavStore, settings: SettingsRepository) {
    super(store, FAMILY_COLLECTIONS.occasions, occasionMapper, readContext(settings), "Ricorrenza non trovata.");
  }

  public override async list(): Promise<Occasion[]> {
    return (await super.list()).sort((left, right) => left.month - right.month || left.day - right.day || left.name.localeCompare(right.name));
  }
}

/** The family menu (all-day events in "Menu"). */
@Injectable()
export class MenuStore extends FamilyObjects<MenuMeal, MenuMealFields> {
  public constructor(store: DavStore, settings: SettingsRepository) {
    super(store, FAMILY_COLLECTIONS.menu, menuMapper, readContext(settings), "Piatto non trovato.");
  }

  /** Dishes between two local dates (both included). */
  public async between(from: string, to: string): Promise<MenuMeal[]> {
    return (await this.list())
      .filter((meal) => meal.date >= from && meal.date <= to)
      .sort((left, right) => left.date.localeCompare(right.date) || MEAL_SLOTS.indexOf(left.slot) - MEAL_SLOTS.indexOf(right.slot) || left.title.localeCompare(right.title));
  }
}

/** Recipes of the family (journal entries in "Ricette"), reused for the menu. */
@Injectable()
export class RecipesStore extends FamilyObjects<Recipe, RecipeFields> {
  public constructor(store: DavStore, settings: SettingsRepository) {
    super(store, FAMILY_COLLECTIONS.recipes, recipeMapper, readContext(settings), "Ricetta non trovata.");
  }

  public override async list(): Promise<Recipe[]> {
    return (await super.list()).sort((left, right) => left.title.localeCompare(right.title));
  }
}

/** The notes board (journal entries in "Note"). */
@Injectable()
export class NotesStore extends FamilyObjects<FamilyNote, NoteFields> {
  public constructor(store: DavStore, settings: SettingsRepository) {
    super(store, FAMILY_COLLECTIONS.notes, noteMapper, readContext(settings), "Nota non trovata.");
  }

  public override async list(): Promise<FamilyNote[]> {
    return (await super.list()).sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt));
  }
}

/** Morning and evening routines of the children (weekly events in "Routine", one step per description line). */
@Injectable()
export class RoutinesStore {
  private readonly objects: FamilyObjects<Routine, RoutineWriteFields>;

  public constructor(
    store: DavStore,
    settings: SettingsRepository,
    private readonly members: MembersRepository
  ) {
    this.objects = new FamilyObjects(store, FAMILY_COLLECTIONS.routines, routineMapper, readContext(settings), "Routine non trovata.");
  }

  public ensure(): Promise<void> {
    return this.objects.ensure();
  }

  public async list(): Promise<Routine[]> {
    return (await this.objects.list()).sort((left, right) => left.startTime.localeCompare(right.startTime) || left.title.localeCompare(right.title));
  }

  public find(id: string): Promise<Routine | undefined> {
    return this.objects.find(id);
  }

  public create(fields: RoutineFields): Promise<Routine> {
    return this.objects.create(this.withWho(fields));
  }

  public update(id: string, fields: RoutineFields): Promise<Routine> {
    return this.objects.update(id, this.withWho(fields));
  }

  public delete(id: string): Promise<void> {
    return this.objects.delete(id);
  }

  public setStep(id: string, date: string, step: number, done: boolean): Promise<Routine> {
    return this.objects.patch(id, (component) => setRoutineStep(component, date, step, done));
  }

  private withWho(fields: RoutineFields): RoutineWriteFields {
    const member = fields.memberId ? this.members.findById(fields.memberId) : undefined;
    return { ...fields, who: member?.display_name ?? null };
  }
}

/** Household shifts (weekly events in "Turni", named after who they belong to). */
@Injectable()
export class ScheduleStore {
  private readonly objects: FamilyObjects<ScheduleEntry, ScheduleWriteFields>;

  public constructor(
    store: DavStore,
    settings: SettingsRepository,
    private readonly members: MembersRepository
  ) {
    this.objects = new FamilyObjects(store, FAMILY_COLLECTIONS.schedule, scheduleMapper, readContext(settings), "Turno non trovato.");
  }

  public get collection(): CollectionSpec {
    return this.objects.collection;
  }

  public ensure(): Promise<void> {
    return this.objects.ensure();
  }

  public async list(): Promise<ScheduleEntry[]> {
    const order = { work: 0, chore: 1, presence: 2 };
    return (await this.objects.list()).sort(
      (left, right) => order[left.kind] - order[right.kind] || (left.startTime ?? "").localeCompare(right.startTime ?? "") || left.title.localeCompare(right.title)
    );
  }

  public find(id: string): Promise<ScheduleEntry | undefined> {
    return this.objects.find(id);
  }

  public create(fields: ScheduleFields, options: { id?: string; now?: Date } = {}): Promise<ScheduleEntry> {
    return this.objects.create(this.withWho(fields), options);
  }

  public update(id: string, fields: ScheduleFields): Promise<ScheduleEntry> {
    return this.objects.update(id, this.withWho(fields));
  }

  public delete(id: string): Promise<void> {
    return this.objects.delete(id);
  }

  public setDone(id: string, date: string, done: boolean): Promise<ScheduleEntry> {
    return this.objects.patch(id, (component) => setChoreDone(component, date, done));
  }

  private withWho(fields: ScheduleFields): ScheduleWriteFields {
    const person = fields.person?.trim() || null;
    const member = fields.memberId ? this.members.findById(fields.memberId) : undefined;
    return { ...fields, person, note: fields.note?.trim() || null, who: member?.display_name ?? person };
  }
}
