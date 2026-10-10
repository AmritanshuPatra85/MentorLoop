import { describe, expect, it } from "vitest";
import { feedbackSubmissionSchema } from "./feedback";

describe("feedback submission contract", () => {
  const valid={rating:5,tags:["communication"],comment:"Helpful",visibility:"public_to_mentor"};
  it("accepts valid feedback",()=>expect(feedbackSubmissionSchema.safeParse(valid).success).toBe(true));
  it("rejects invalid ratings, unknown tags, duplicate tags, and long comments",()=>{
    expect(feedbackSubmissionSchema.safeParse({...valid,rating:6}).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({...valid,tags:["invented"]}).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({...valid,tags:["other","other"]}).success).toBe(false);
    expect(feedbackSubmissionSchema.safeParse({...valid,comment:"x".repeat(2001)}).success).toBe(false);
  });
});
