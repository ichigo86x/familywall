import { Injectable, PipeTransform } from "@nestjs/common";
import type { ZodType, ZodTypeDef } from "zod";
import { AppException } from "../errors/app-exception";

@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  public constructor(private readonly schema: ZodType<TOutput, ZodTypeDef, unknown>) {}

  public transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const fields = result.error.issues.map((issue) => `${issue.path.join(".") || "richiesta"}: ${issue.message}`);
      throw AppException.validation(`Dati non validi (${fields.slice(0, 3).join("; ")}).`, {
        issues: result.error.flatten()
      });
    }

    return result.data;
  }
}