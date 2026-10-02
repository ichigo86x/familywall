import { Injectable, PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";
import { AppException } from "../errors/app-exception";

@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  public constructor(private readonly schema: ZodType<TOutput>) {}

  public transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw AppException.validation("Dati non validi.", {
        issues: result.error.flatten()
      });
    }

    return result.data;
  }
}