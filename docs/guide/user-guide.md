# Using Canvas

Canvas has two pages: **Canvas** (the drawing board) and **Objects** (the shapes you can put on it). Everything saves by itself a moment after a change ("All changes saved" shows under the settings). Nothing is saved while a setting is not allowed; the page says why.

## Canvas page
- **Settings:** name, width and height in whole pixels, grid (pixels between grid points, 0 = no grid) and a switch that shows or hides the grid points. The grid size is kept when the points are hidden.
- **Saved canvases:** click one to open it, **New canvas** to start another, **Delete** to remove one for good.
- **Object list:** the objects made on the Objects page, to the side of the canvas. Drag one onto the canvas to place a copy.

### Placing and moving
- A placed object is an independent **copy**. Changing or deleting the original object never changes a canvas.
- The **centre** of an object sticks to a grid point. Everything stays inside the canvas.
- Drag an object to move it. Click to pick it; a picked object shows its handles. **Delete** (or Backspace, when you are not typing in a field) removes the picked objects.

### Figures and arrows
- A **figure** (square, circle, triangle, histogram) has 8 connection points on its border (a triangle has 6). They show when you pick it or while you drag something.
- An **arrow** has two connection points, one at each end.
- Drag an arrow end close to a figure point (within 24 px) and it **snaps** onto it exactly and is fastened: the point is drawn as a point in a point. The other way round works too: drag a figure close to a free arrow end.
- A fastened arrow **follows** its figure when you move or resize it; the other end stays. Deleting the figure frees its arrows.
- Grab an arrow near an end to move that end alone. The two round handles on its sides change its **width across**.

### Curving an arrow
A picked arrow shows three diamond handles, a quarter, half and three quarters of the way along it. Drag each sideways on its own to curve the arrow, even into an S. Drag back to the line to make it straight (3 px or less on all three is straight). The ends do not move, so what the arrow is fastened to stays fastened.

### Resizing
- **One figure:** drag one of its 8 handles. The opposite edge stays, the edge goes to the grid, a square or circle stays equal-sided, and it is at least 4 px.
- **Several objects:** drag a rectangle on the empty canvas to pick everything inside it, then drag a handle of the box. Positions scale with the box on each axis; each figure keeps its shape and scales by the factor that changed more. An arrow is stretched by its ends and its thickness and curve scale the same way.

### Layers
The canvas is layer 0. Objects are on layers 1–1000, the first on 10. A new object goes on the highest layer in use. A higher layer is in front. Change the layer of the picked objects in the layer field.

## Objects page
Make and edit the objects you place on canvases.
- **Figure:** shape, default size (drag to draw the size), border width and colour, background and front colours, font size, corner radius (rounded corners).
- **Connector (arrow):** one way or both ways, solid or hollow. A hollow arrow's thickness is its border and you drag its size; a solid arrow's height is its thickness.
- A square and a circle always have equal sides. Objects autosave too, and can be deleted from the list.

## Limits
Canvas sides 1–10000 px, name up to 60 characters, at most 200 placed objects per canvas, objects at most 10000 px on a side, 100 canvases and 200 objects saved.
