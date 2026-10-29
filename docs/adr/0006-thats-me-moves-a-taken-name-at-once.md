# That's me moves a taken name at once

Supersedes ADR 0005 ("A taken name joins numbered").

ADR 0005 numbered a name held on another phone ("Tom Barker 2") because That's me needed a lead to approve it, and the race flow had removed the screen a lead approved on. Numbered names split one volunteer into two profiles, and no lead screen offers an approval to bring back.

So Join, with the Olympics password or today's lead code alike, now asks "Is this you on a new phone?" when the name typed belongs to a profile held on another phone, with That's me and "No, I'm someone else". That's me moves the profile to this phone at once: it gets a new secret, its session today starts again with the role the code just typed gives, and the other phone's session ends as moved. Typing the password is trust enough; decided by the owner on 29 Oct 2026 ("they know the password"). "No, I'm someone else" asks for a middle name or initial. A name this phone already holds signs in again, as before.

This also narrows ADR 0004: a lead joining with the lead code and a taken name gets the same question instead of a numbered name. Owner sign-in and the older Lead sign-in route still number a taken name.

## Consequences

- One person is one name across phones; Results and the Day export no longer show numbered copies made at Join.
- Someone who knows the password could knowingly take another volunteer's name. Accepted as low risk: the old phone shows Join without the name at once, and its owner can take it back the same way.
- The old phone forgets the name on its next request and shows Join.
- The lead approve and decline routes, the status and cancel routes, the request route and the waiting screen are gone, with the waiting requests' To check count.
