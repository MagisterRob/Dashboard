$(document).ready(function () {
    function filterProjects(type) {
      $(".filters button").removeClass("active");
      $(`.filters button[data-filter="${type}"]`).addClass("active");
  
      $(".project-card").each(function () {
        if (type === "all" || $(this).data("category") === type) {
          $(this).removeClass("hidden");
        } else {
          $(this).addClass("hidden");
        }
      });
    }
  
    function selectRoom(room) {
      $(".map-room, .find-item").removeClass("active");
  
      $(`.map-room[data-room="${room}"]`).addClass("active");
      $(`.find-item[data-room="${room}"]`).addClass("active");
  
      if (room === "entrance") {
        $("#roomText").text(
          "Börja här. Vi hjälper dig att hitta rätt under öppet hus."
        );
      }
  
      if (room === "tech") {
        $("#roomText").text(
          "Här hittar du AI, webbutveckling, programmering och spelutveckling."
        );
      }
  
      if (room === "estet") {
        $("#roomText").text(
          "Här hittar du grafisk design, foto, film, musikproduktion och spelgrafik."
        );
      }
    }
  
    function openProject(project) {
      $("#modalTitle").text(project.data("title"));
      $("#modalType").text(`[ ${project.data("type").toUpperCase()} ]`);
      $("#modalDescription").text(project.data("description"));
      $("#modalTech").text(project.data("tech"));
  
      $(".project-modal").addClass("active");
      $("body").addClass("lock");
    }
  
    function closeProject() {
      $(".project-modal").removeClass("active");
      $("body").removeClass("lock");
    }
  
    function scrollToSection(target) {
      if (!$(target).length) {
        return;
      }
  
      $("html, body").stop().animate(
        {
          scrollTop:
            $(target).offset().top -
            ($(".header").outerHeight() || 0)
        },
        750,
        "swing"
      );
    }
  
    $(".menu-btn").on("click", function () {
      $(".mobile-menu").toggleClass("active");
    });
  
    $(".mobile-menu a").on("click", function () {
      $(".mobile-menu").removeClass("active");
    });
  
    $("a[href^='#']").on("click", function (e) {
      let target = $(this).attr("href");
  
      if (!target || target === "#") {
        return;
      }
  
      if (!$(target).length) {
        return;
      }
  
      e.preventDefault();
  
      $(".mobile-menu").removeClass("active");
  
      scrollToSection(target);
    });
  
    $(".filters button").on("click", function () {
      filterProjects($(this).data("filter"));
    });
  
    $(".program-card").on("click", function () {
      filterProjects($(this).data("filter"));
  
      scrollToSection("#projekt");
    });
  
    $(".program-card button").on("click", function (e) {
      e.stopPropagation();
  
      filterProjects(
        $(this).closest(".program-card").data("filter")
      );
  
      scrollToSection("#projekt");
    });
  
    $(".map-room, .find-item").on("click", function () {
      selectRoom($(this).data("room"));
    });
  
    $(".project-card").on("click", function () {
      openProject($(this));
    });
  
    $(".modal-close, .modal-overlay").on("click", function () {
      closeProject();
    });
  
    $(document).on("keydown", function (e) {
      if (e.key === "Escape") {
        closeProject();
        $(".mobile-menu").removeClass("active");
      }
    });
  
    $(".footer-bottom a, .final-link, .banner, .scroll-label").on(
      "mouseenter",
      function () {
        $(this).find("span:last-child").css({
          position: "relative",
          transition: "all ease 150ms"
        });
  
        if ($(this).attr("href") === "#start") {
          $(this).find("span:last-child").css("top", "-3px");
        } else {
          $(this).find("span:last-child").css("left", "4px");
        }
      }
    );
  
    $(".footer-bottom a, .final-link, .banner, .scroll-label").on(
      "mouseleave",
      function () {
        $(this).find("span:last-child").css({
          top: "0",
          left: "0"
        });
      }
    );
  
    $(window).on("scroll", function () {
      if ($(window).scrollTop() > 30) {
        $(".header").css({
          background: "#111111f5",
          "backdrop-filter": "blur(8px)"
        });
      } else {
        $(".header").css({
          background: "#111111",
          "backdrop-filter": "none"
        });
      }
  
      $("section[id]").each(function () {
        let top = $(this).offset().top - 150;
        let bottom = top + $(this).outerHeight();
  
        if (
          $(window).scrollTop() >= top &&
          $(window).scrollTop() < bottom
        ) {
          $(".desktop-nav a").css({
            color: "#ffffff",
            "border-color": "transparent"
          });
  
          $(`.desktop-nav a[href="#${$(this).attr("id")}"]`).css({
            color: "#ffeb3b",
            "border-color": "#ffeb3b"
          });
        }
      });
    });
  
    $(".reveal").each(function () {
      if (
        $(this).offset().top <
        $(window).scrollTop() + $(window).height() - 80
      ) {
        $(this).addClass("visible");
      }
    });
  
    $(window).on("scroll", function () {
      $(".reveal:not(.visible)").each(function () {
        if (
          $(this).offset().top <
          $(window).scrollTop() + $(window).height() - 80
        ) {
          $(this).addClass("visible");
        }
      });
    });
  });